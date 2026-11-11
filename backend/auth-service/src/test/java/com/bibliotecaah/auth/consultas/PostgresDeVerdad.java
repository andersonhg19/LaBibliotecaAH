package com.bibliotecaah.auth.consultas;

import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * ============================================================================
 * UN POSTGRESQL DE VERDAD PARA LAS PRUEBAS DE CONSULTAS
 * ============================================================================
 *
 * POR QUE EXISTE
 * --------------
 * Toda la suite corre contra H2. H2 no es PostgreSQL: acepta sintaxis que
 * PostgreSQL rechaza y rechaza sintaxis que PostgreSQL acepta, y difiere en lo
 * que mas duele en este proyecto —como infiere el tipo de un parametro suelto
 * (`:x IS NULL`), como ordena texto, como trata la lista vacia de un IN—. Una
 * @Query podia por tanto estar ROTA en produccion y verde en la construccion:
 * el fallo no aparecia hasta que alguien abria la pantalla en el movil.
 *
 * Las pruebas que heredan de aqui ejecutan cada consulta contra el mismo motor
 * y la misma version que el docker-compose (postgres:14) y comprueban el
 * RESULTADO. Comprobar que "no explota" no vale: una consulta que devuelve la
 * lista vacia nunca explota, y estar vacia es justo el bug.
 *
 * De regalo, el contenedor arranca con las MIGRACIONES DE FLYWAY de verdad y
 * ddl-auto=validate, asi que el mapeo JPA se compara contra el esquema real de
 * PostgreSQL y no contra la traduccion que H2 hace de el.
 *
 * SI NO HAY DOCKER, SE SALTA (no falla)
 * -------------------------------------
 * `disabledWithoutDocker` deja estas clases en "skipped" cuando no hay demonio
 * de Docker. Es deliberado: `mvn verify` tiene que seguir funcionando en un
 * portatil sin Docker Desktop arrancado. El precio es que el aviso llega en CI
 * en vez de en local, y por eso el guardarraíl no puede ser SOLO este.
 *
 * UN SOLO CONTENEDOR PARA TODAS LAS CLASES
 * ----------------------------------------
 * El contenedor se arranca en un bloque estatico y NO se anota con @Container:
 * un @Container estatico lo para la extension al acabar CADA clase, y levantar
 * PostgreSQL una vez por clase multiplica los minutos de la construccion. Aqui
 * se levanta una vez por JVM y lo entierra Ryuk al terminar.
 *
 * Cada @DataJpaTest corre dentro de una transaccion que se deshace al final,
 * asi que compartir el contenedor no mezcla los datos de una prueba con los de
 * la siguiente.
 *
 * HAY UNA COPIA DE ESTA CLASE EN CADA SERVICIO
 * --------------------------------------------
 * Y es a proposito. Compartirla exigiria un modulo de utilidades de prueba con
 * su propio pom y su test-jar, y cada servicio tiene ademas su propio esquema,
 * su propio Flyway y su propio perfil de pruebas: lo unico comun son estas
 * treinta lineas. Un modulo entero para no repetirlas costaria mas de lo que
 * ahorra. Si se toca una, se tocan las tres.
 */
@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        // El perfil de pruebas del servicio apunta a H2; aqui mandan estas.
        "spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true"
})
abstract class PostgresDeVerdad {

    /**
     * La misma imagen que el docker-compose. Probar contra una version que no
     * es la que se despliega seria cambiar un motor equivocado por otro.
     */
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:14");

    static {
        /* La comprobacion es redundante con disabledWithoutDocker cuando la
           clase esta deshabilitada, pero protege del caso en que algo cargue
           esta clase por otro camino: sin ella, la ausencia de Docker seria un
           ExceptionInInitializerError en vez de un "skipped". */
        if (DockerClientFactory.instance().isDockerAvailable()) {
            POSTGRES.start();
        }
    }
}
