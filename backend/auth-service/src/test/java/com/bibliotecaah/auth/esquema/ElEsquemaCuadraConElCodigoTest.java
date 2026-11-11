package com.bibliotecaah.auth.esquema;

import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ============================================================================
 * EL ESQUEMA CUADRA CON EL CODIGO (Y NO SE FIA DE EL)
 * ============================================================================
 *
 * Que esta prueba levante el contexto ya es media prueba: el esquema lo
 * construye Flyway y ddl-auto=validate lo compara columna a columna contra el
 * mapeo. Con el "update" de antes, anadir un @Column(nullable=false) a una
 * tabla con datos fallaba como WARN y la aplicacion arrancaba igual con la
 * base desincronizada; ahora, si alguien toca una entidad y se olvida de la
 * migracion, esto no arranca y se entera aqui, no en produccion.
 *
 * La otra media es que las reglas que solo vivian en Java ahora tambien estan
 * escritas en la base.
 */
@SpringBootTest
@DisplayName("El esquema de auth valida contra el mapeo y sostiene sus invariantes")
class ElEsquemaCuadraConElCodigoTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository usuarios;

    @BeforeEach
    void vaciar() {
        usuarios.deleteAll();
    }

    private User usuario(String correo) {
        return User.builder()
                .name("Prueba").email(correo).alias(correo.substring(0, correo.indexOf('@')))
                .password("$2a$10$hashfalsoperoconpinta")
                .active(true)
                .build();
    }

    @Test
    @DisplayName("las migraciones se aplicaron: el esquema lo puso Flyway, no Hibernate")
    void lasMigracionesSeAplicaron() {
        Integer ultima = jdbc.queryForObject(
                // Flyway crea su tabla con el nombre entrecomillado en minuscula; sin
                // comillas H2 la busca en mayuscula y no la encuentra.
                "SELECT MAX(CAST(\"version\" AS INT)) FROM \"flyway_schema_history\" WHERE \"success\" = TRUE",
                Integer.class);
        /* "De la V2 en adelante", no "exactamente la V2": lo que se defiende es
           que las invariantes esten puestas. Clavar el numero exacto convertia
           cada migracion nueva en un fallo de esta prueba, y con validate
           anadir un campo YA obliga a escribir una migracion. */
        assertThat(ultima).isGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("QA UX-14 (V6): los nombres visibles de la semilla llevan tilde; codigos y rutas no cambian")
    void nombresVisiblesConTildes() {
        assertThat(jdbc.queryForObject("SELECT name FROM bah_auth_module WHERE code = 'administracion'", String.class))
                .isEqualTo("Administración");
        assertThat(jdbc.queryForList("SELECT name || '|' || route FROM bah_auth_page WHERE code IN "
                + "('admin-modulos', 'admin-auditoria', 'admin-usuarios') ORDER BY sort_order", String.class))
                .containsExactly("Usuarios|AdminUsers", "Módulos|AdminModules", "Auditoría|AdminAudit");
        assertThat(jdbc.queryForObject("SELECT description FROM bah_auth_role WHERE name = 'ADMIN'", String.class))
                .isEqualTo("Administra usuarios, roles y módulos de la plataforma");
        assertThat(jdbc.queryForObject("SELECT description FROM bah_auth_app_config WHERE config_key = 'app.locale'",
                String.class)).isEqualTo("Cómo se muestran fechas y números");
        assertThat(jdbc.queryForList("SELECT name FROM bah_auth_page UNION ALL SELECT name FROM bah_auth_module",
                String.class)).as("ningun nombre visible sin tilde de los conocidos")
                .doesNotContain("Modulos", "Auditoria", "Administracion");
    }

    @Test
    @DisplayName("dos cuentas con el mismo correo: la base dice que no")
    void elCorreoEsUnico() {
        usuarios.saveAndFlush(usuario("ana@biblioteca.ah"));

        assertThatThrownBy(() -> usuarios.saveAndFlush(usuario("ana@biblioteca.ah")))
                .as("dos altas simultaneas con el mismo correo dejaban dos cuentas y el login "
                        + "no sabria a cual entrar")
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
