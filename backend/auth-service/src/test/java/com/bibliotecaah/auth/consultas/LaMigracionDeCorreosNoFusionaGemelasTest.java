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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QA SE-04: V4 anade la version de sesion y V5 normaliza los correos que ya
 * existen. Las gemelas (mismo correo salvo mayusculas) NO se fusionan: se
 * quedan como estaban y el log lo avisa. En PostgreSQL, sin gemelas, V5 deja
 * ademas un indice unico sobre lower(email).
 */
@DisplayName("Las migraciones V4 y V5 sobre una base con cuentas")
class LaMigracionDeCorreosNoFusionaGemelasTest {

    static boolean hayDocker() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    abstract static class Escenario {

        String url;

        abstract String baseNueva() throws SQLException;

        abstract String usuario();

        abstract String clave();

        @BeforeEach
        void migrarHastaV4() throws SQLException {
            url = baseNueva();
            Flyway.configure().dataSource(url, usuario(), clave()).locations("classpath:db/migration")
                    .target("4").load().migrate();
        }

        void migrarTodo() {
            Flyway.configure().dataSource(url, usuario(), clave()).locations("classpath:db/migration")
                    .load().migrate();
        }

        void ejecutar(String sql) throws SQLException {
            try (Connection c = DriverManager.getConnection(url, usuario(), clave()); Statement s = c.createStatement()) {
                s.executeUpdate(sql);
            }
        }

        void cuenta(int id, String correo) throws SQLException {
            ejecutar("INSERT INTO bah_auth_user (id, name, email, alias, password, active) VALUES ("
                    + id + ", 'C', '" + correo + "', 'alias" + id + "', 'x', TRUE)");
        }

        List<String> correos() throws SQLException {
            List<String> lista = new ArrayList<>();
            try (Connection c = DriverManager.getConnection(url, usuario(), clave()); Statement s = c.createStatement();
                 ResultSet rs = s.executeQuery("SELECT email FROM bah_auth_user ORDER BY id")) {
                while (rs.next()) lista.add(rs.getString(1));
            }
            return lista;
        }

        int versionDeSesion(int id) throws SQLException {
            try (Connection c = DriverManager.getConnection(url, usuario(), clave()); Statement s = c.createStatement();
                 ResultSet rs = s.executeQuery("SELECT version_sesion FROM bah_auth_user WHERE id = " + id)) {
                rs.next();
                return rs.getInt(1);
            }
        }

        @Test
        @DisplayName("normaliza las cuentas sin gemela y deja intactas las gemelas")
        void normalizaSinFusionar() throws SQLException {
            cuenta(1, "anderson@biblioteca.ah");
            cuenta(2, "  Ana.Perez@Correo.COM ");
            cuenta(3, "pedro@x.com");
            cuenta(4, "PEDRO@X.COM");
            cuenta(5, "Pedro@x.com ");

            migrarTodo();

            assertThat(correos()).containsExactly("anderson@biblioteca.ah", "ana.perez@correo.com",
                    "pedro@x.com", "PEDRO@X.COM", "Pedro@x.com ");
            assertThat(versionDeSesion(2)).as("V4: todas empiezan en 0").isZero();
        }
    }

    @Nested
    @DisplayName("en H2")
    class EnH2 extends Escenario {

        @Override
        String baseNueva() {
            return "jdbc:h2:mem:v5-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
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
    @DisplayName("en PostgreSQL 14")
    @EnabledIf("com.bibliotecaah.auth.consultas.LaMigracionDeCorreosNoFusionaGemelasTest#hayDocker")
    class EnPostgres extends Escenario {

        @Override
        String baseNueva() throws SQLException {
            var pg = PostgresDeVerdad.POSTGRES;
            String nombre = "v5_" + UUID.randomUUID().toString().replace("-", "");
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

        @Test
        @DisplayName("sin gemelas crea el indice unico sobre lower(email): la base ya no admite una gemela")
        void creaIndice() throws SQLException {
            cuenta(1, "Ana@X.com");
            migrarTodo();

            assertThat(correos()).containsExactly("ana@x.com");
            assertThatThrownBy(() -> cuenta(2, "ANA@x.com")).isInstanceOf(SQLException.class);
        }

        @Test
        @DisplayName("con gemelas no crea el indice (crearlo tumbaria el arranque)")
        void sinIndiceConGemelas() throws SQLException {
            cuenta(1, "ana@x.com");
            cuenta(2, "ANA@x.com");
            migrarTodo();

            cuenta(3, "Ana@X.com");
            assertThat(correos()).hasSize(3);
        }
    }
}
