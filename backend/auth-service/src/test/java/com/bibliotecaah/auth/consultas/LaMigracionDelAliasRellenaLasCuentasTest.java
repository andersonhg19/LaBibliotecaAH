package com.bibliotecaah.auth.consultas;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.testcontainers.DockerClientFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ============================================================================
 * LA MIGRACION V3 SOBRE UNA BASE CON CUENTAS (H2 Y POSTGRESQL 14)
 * ============================================================================
 *
 * Las demas pruebas aplican V3 sobre una tabla vacia: ahi el relleno del alias
 * no hace nada y no se nota si esta mal. Aqui se migra hasta V2, se meten
 * cuentas como las que hay en casa (y las raras que podria haber), se aplica
 * V3 y se compara el alias de CADA una con el esperado.
 *
 * Corre en los dos motores porque la migracion tiene que valer en los dos y
 * es justo donde mas se separan (REGEXP_REPLACE, TRANSLATE, LEFT...). La de
 * PostgreSQL usa el mismo contenedor que PostgresDeVerdad, en una base propia,
 * y se salta si no hay Docker.
 */
@DisplayName("La migracion V3 rellena el alias de las cuentas que ya existen")
class LaMigracionDelAliasRellenaLasCuentasTest {

    /** Correo -> alias esperado tras V3. Los ids van del 1 al 13 en este orden. */
    private static final Map<String, String> ESPERADO = new LinkedHashMap<>();

    static {
        ESPERADO.put("admin@biblioteca.ah", "admin");
        ESPERADO.put("anderson@biblioteca.ah", "anderson");
        ESPERADO.put("samy@biblioteca.ah", "samy");
        ESPERADO.put("José.Pérez+Libros@Correo.com", "jose.perez.libros");  // tildes y +
        ESPERADO.put("admin@otro.com", "admin-5");                          // choca con la semilla
        ESPERADO.put("pedro@a.com", "pedro");                               // el de id menor se queda
        ESPERADO.put("Pedro@b.com", "pedro-7");                             // el otro lleva sufijo
        ESPERADO.put("jo@x.com", "jo-8");                                   // corto
        ESPERADO.put("+++@x.com", "usuario");                               // solo signos
        ESPERADO.put("дмитрий@x.ru", "usuario-10");                         // otro alfabeto, y repetido
        ESPERADO.put("unnombredeusuariomuylargoquepasade30caracteres@x.com", "unnombredeusuariomuylargoquepa");
        ESPERADO.put("sinarroba", "sinarroba");                             // correo sin @ (la base lo admite)
        ESPERADO.put("  Ana Maria@x.com ", "ana.maria");                    // espacios
    }

    static boolean hayDocker() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    abstract static class Escenario {

        private String url;

        /** Una base vacia, recien creada, para cada prueba. */
        abstract String baseNueva() throws SQLException;

        abstract String usuario();

        abstract String clave();

        @BeforeEach
        void migrarHastaV2YSembrar() throws SQLException {
            url = baseNueva();
            flyway("2").migrate();
            try (Connection c = abrir(); Statement s = c.createStatement()) {
                long id = 1;
                for (String correo : ESPERADO.keySet()) {
                    s.executeUpdate("INSERT INTO bah_auth_user (id, name, email, password, active) VALUES ("
                            + id++ + ", 'Cuenta', '" + correo + "', 'x', TRUE)");
                }
            }
        }

        private Flyway flyway(String hasta) {
            return Flyway.configure()
                    .dataSource(url, usuario(), clave())
                    .locations("classpath:db/migration")
                    .target(hasta)
                    .load();
        }

        private Connection abrir() throws SQLException {
            return DriverManager.getConnection(url, usuario(), clave());
        }

        private Map<String, String> aliasPorCorreo() throws SQLException {
            Map<String, String> encontrado = new LinkedHashMap<>();
            try (Connection c = abrir(); Statement s = c.createStatement();
                 ResultSet filas = s.executeQuery("SELECT email, alias FROM bah_auth_user ORDER BY id")) {
                while (filas.next()) {
                    encontrado.put(filas.getString(1), filas.getString(2));
                }
            }
            return encontrado;
        }

        private void ejecutar(String sql) throws SQLException {
            try (Connection c = abrir(); Statement s = c.createStatement()) {
                s.executeUpdate(sql);
            }
        }

        @Test
        @DisplayName("cada cuenta recibe el alias esperado: semilla fija, derivado del correo, saneado y desambiguado")
        void rellenaCadaCuenta() throws SQLException {
            flyway("3").migrate();

            assertThat(aliasPorCorreo()).containsExactlyEntriesOf(ESPERADO);
        }

        @Test
        @DisplayName("despues de V3 la base exige alias: no nulo, unico, en minusculas, sin @ y de 3 o mas")
        void dejaLasReglasPuestas() throws SQLException {
            flyway("3").migrate();

            assertThatThrownBy(() -> ejecutar("INSERT INTO bah_auth_user (id, name, email, password, active) "
                    + "VALUES (50, 'N', 'n@x.com', 'x', TRUE)"))
                    .as("sin alias").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) "
                    + "VALUES (51, 'N', 'n@x.com', 'samy', 'x', TRUE)"))
                    .as("alias repetido").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) "
                    + "VALUES (52, 'N', 'n@x.com', 'Samy', 'x', TRUE)"))
                    .as("con mayusculas (asi 'Samy' no puede convivir con 'samy')").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) "
                    + "VALUES (53, 'N', 'n@x.com', 'n@x', 'x', TRUE)"))
                    .as("con @").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) "
                    + "VALUES (54, 'N', 'n@x.com', 'ab', 'x', TRUE)"))
                    .as("corto").isInstanceOf(SQLException.class);

            ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) "
                    + "VALUES (55, 'N', 'n@x.com', 'nueva', 'x', TRUE)");
            assertThat(aliasPorCorreo()).containsEntry("n@x.com", "nueva");
        }
    }

    @Nested
    @DisplayName("en H2 (la base de las pruebas)")
    class EnH2 extends Escenario {

        @Override
        String baseNueva() {
            return "jdbc:h2:mem:v3-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
        }

        @Override
        String usuario() {
            return "sa";
        }

        @Override
        String clave() {
            return "";
        }
    }

    @Nested
    @DisplayName("en PostgreSQL 14 (la de casa)")
    @EnabledIf("com.bibliotecaah.auth.consultas.LaMigracionDelAliasRellenaLasCuentasTest#hayDocker")
    class EnPostgres extends Escenario {

        @Override
        String baseNueva() throws SQLException {
            var pg = PostgresDeVerdad.POSTGRES;
            String nombre = "v3_" + UUID.randomUUID().toString().replace("-", "");
            try (Connection c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 Statement s = c.createStatement()) {
                s.executeUpdate("CREATE DATABASE " + nombre);
            }
            String base = pg.getJdbcUrl();
            return base.substring(0, base.lastIndexOf('/') + 1) + nombre;
        }

        @Override
        String usuario() {
            return PostgresDeVerdad.POSTGRES.getUsername();
        }

        @Override
        String clave() {
            return PostgresDeVerdad.POSTGRES.getPassword();
        }
    }
}
