package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * QA SE-04: "QA-SEG-E-X@BIBLIOTECA.AH" creaba una cuenta gemela de
 * "qa-seg-e-x@biblioteca.ah". QA SE-10: registrar el correo de una cuenta
 * desactivada daba un 500. QA SE-09: "aaaaaaa1" y "       1a" eran claves validas.
 */
@SpringBootTest
@DisplayName("Correos normalizados, sin gemelas, y claves no triviales")
class LosCorreosSeNormalizanTest {

    private static final String CLAVE = "ClaveSegura2026";
    private static final String NO_DISPONIBLE = "No se pudo crear la cuenta con ese correo. Si ya tienes una, inicia sesión.";
    private static final String DEBIL = "Esa contraseña es demasiado fácil de adivinar: usa al menos 10 caracteres "
            + "variados, sin espacios al principio ni al final.";

    @Autowired private WebApplicationContext contexto;
    @Autowired private UserRepository usuarios;
    @Autowired private RoleRepository roles;
    @Autowired private PasswordEncoder cifrador;
    @Autowired private ObjectMapper json;

    private MockMvc mvc;

    @BeforeEach
    void preparar() {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).apply(springSecurity()).build();
        usuarios.deleteAll();
    }

    @AfterEach
    void limpiar() {
        usuarios.deleteAll();
    }

    private JsonNode llamar(String ruta, Object cuerpo, String token) throws Exception {
        var p = post(ruta).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(cuerpo));
        if (token != null) p.header("Authorization", "Bearer " + token);
        return json.readTree(mvc.perform(p).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode registrar(String correo, String alias, String clave) throws Exception {
        return llamar("/v1/auth/register", Map.of("name", "X", "email", correo, "alias", alias, "password", clave), null);
    }

    @Nested
    @DisplayName("Registro publico")
    class Registro {

        @Test
        @DisplayName("el correo se guarda recortado y en minusculas, y se entra con cualquier forma")
        void normaliza() throws Exception {
            JsonNode r = registrar("  Ana.Perez@Biblioteca.AH ", "anap", CLAVE);

            assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
            assertThat(r.get("object").get("email").asText()).isEqualTo("ana.perez@biblioteca.ah");
            assertThat(usuarios.findAll()).extracting(User::getEmail).containsExactly("ana.perez@biblioteca.ah");
            assertThat(llamar("/v1/auth/login", Map.of("usuario", "ANA.PEREZ@BIBLIOTECA.AH", "password", CLAVE), null)
                    .get("correct").asBoolean()).isTrue();
        }

        @Test
        @DisplayName("el mismo correo en mayusculas no crea una gemela: 102")
        void sinGemelas() throws Exception {
            registrar("ana@biblioteca.ah", "ana", CLAVE);
            JsonNode r = registrar("ANA@BIBLIOTECA.AH", "ana2", CLAVE);

            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(r.get("message").asText()).isEqualTo(NO_DISPONIBLE);
            assertThat(usuarios.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("el correo de una cuenta desactivada da el mismo 102, no un 500 (SE-10)")
        void desactivada() throws Exception {
            usuarios.save(User.builder().name("Vieja").email("vieja@biblioteca.ah").alias("vieja")
                    .password(cifrador.encode(CLAVE)).active(false).build());

            JsonNode r = registrar("vieja@biblioteca.ah", "nueva", CLAVE);

            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(r.get("message").asText()).isEqualTo(NO_DISPONIBLE);
        }

        @Test
        @DisplayName("claves triviales se rechazan con mensaje claro (SE-09)")
        void clavesDebiles() throws Exception {
            for (String debil : new String[]{"aaaaaaaaa1", "Password123", "1234567890a ", " abcdefgh12"}) {
                JsonNode r = registrar("debil@biblioteca.ah", "debil", debil);
                assertThat(r.get("errorCode").asInt()).as(debil).isEqualTo(400);
                assertThat(r.get("message").asText()).as(debil).isEqualTo(DEBIL);
            }
            JsonNode corta = registrar("debil@biblioteca.ah", "debil", "abcdefg1");
            assertThat(corta.get("message").asText())
                    .isEqualTo("Revisa los datos enviados: el campo 'password' debe tener entre 10 y 100 caracteres.");
            assertThat(usuarios.count()).isZero();
        }
    }

    @Nested
    @DisplayName("Edicion")
    class Edicion {

        @Test
        @DisplayName("el administrador no puede poner el correo de otra cuenta cambiando mayusculas")
        void adminSinGemelas() throws Exception {
            Role admin = roles.findByNameAndActiveTrue("ADMIN").orElseThrow();
            usuarios.save(User.builder().name("Jefa").email("jefa@biblioteca.ah").alias("jefa")
                    .password(cifrador.encode(CLAVE)).active(true).roles(new HashSet<>(Set.of(admin))).build());
            Long bea = usuarios.save(User.builder().name("Bea").email("bea@biblioteca.ah").alias("bea")
                    .password(cifrador.encode(CLAVE)).active(true).build()).getId();
            String token = llamar("/v1/auth/login", Map.of("usuario", "jefa", "password", CLAVE), null)
                    .get("object").get("token").asText();

            JsonNode r = llamar("/v1/admin/users/save",
                    Map.of("id", bea, "name", "Bea", "email", " JEFA@biblioteca.ah"), token);
            assertThat(r.get("errorCode").asInt()).isEqualTo(102);

            JsonNode ok = llamar("/v1/admin/users/save", Map.of("id", bea, "name", "Bea", "email", " BEA.B@X.CO "), token);
            assertThat(ok.get("object").get("email").asText()).isEqualTo("bea.b@x.co");
        }

        @Test
        @DisplayName("el alta de administracion tambien normaliza y rechaza claves debiles")
        void adminAlta() throws Exception {
            Role admin = roles.findByNameAndActiveTrue("ADMIN").orElseThrow();
            usuarios.save(User.builder().name("Jefa").email("jefa@biblioteca.ah").alias("jefa")
                    .password(cifrador.encode(CLAVE)).active(true).roles(new HashSet<>(Set.of(admin))).build());
            String token = llamar("/v1/auth/login", Map.of("usuario", "jefa", "password", CLAVE), null)
                    .get("object").get("token").asText();

            JsonNode debil = llamar("/v1/admin/users/save",
                    Map.of("name", "C", "email", "c@x.co", "alias", "ccc", "password", "qwerty1234"), token);
            assertThat(debil.get("message").asText()).isEqualTo(DEBIL);

            JsonNode r = llamar("/v1/admin/users/save",
                    Map.of("name", "C", "email", " C@X.CO", "alias", "ccc", "password", CLAVE), token);
            assertThat(r.get("object").get("email").asText()).isEqualTo("c@x.co");
        }
    }
}
