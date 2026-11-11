package com.bibliotecaah.auth.consultas;

import org.junit.jupiter.api.DisplayName;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * LoginConCorreoOAlias sobre PostgreSQL 14 (el contenedor de PostgresDeVerdad):
 * la busqueda de correo sin mayusculas y las migraciones hasta V3 contra el
 * motor de casa. Se salta si no hay Docker.
 */
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect",
        "spring.datasource.driver-class-name=org.postgresql.Driver"
})
@DisplayName("Login con correo o alias, de punta a punta (PostgreSQL 14)")
class ElLoginConCorreoOAliasEnPostgresTest extends LoginConCorreoOAlias {

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry propiedades) {
        propiedades.add("spring.datasource.url", PostgresDeVerdad.POSTGRES::getJdbcUrl);
        propiedades.add("spring.datasource.username", PostgresDeVerdad.POSTGRES::getUsername);
        propiedades.add("spring.datasource.password", PostgresDeVerdad.POSTGRES::getPassword);
    }
}
