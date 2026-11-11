package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
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
 * QA SE-02: desactivar una cuenta, cambiarle los roles o cambiar la clave
 * cerraba... nada: el token seguia valiendo 10 dias. Ahora cada token lleva la
 * version de sesion de la cuenta ("ver") y auth-service rechaza al momento los
 * de una version vieja o de una cuenta inactiva.
 *
 * Y QA SE-11: sin token o sin rol, 401 / 403 con el ResultDTO del contrato.
 */
@SpringBootTest
@DisplayName("La sesion se revoca al momento (SE-02) y los 401/403 hablan el contrato (SE-11)")
class LaSesionSeRevocaAlMomentoTest {

    private static final String CLAVE = "ClaveSegura2026";
    private static final String REVOCADA = "Tu sesión ya no es válida (la cuenta cambió o se desactivó). "
            + "Vuelve a iniciar sesión.";

    @Autowired private WebApplicationContext contexto;
    @Autowired private UserRepository usuarios;
    @Autowired private RoleRepository roles;
    @Autowired private PasswordEncoder cifrador;
    @Autowired private ObjectMapper json;

    private MockMvc mvc;
    private Long idDeAna;
    private Long idDeJefa;

    @BeforeEach
    void preparar() {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).apply(springSecurity()).build();
        usuarios.deleteAll();
        Role user = roles.findByNameAndActiveTrue("USER").orElseThrow();
        Role admin = roles.findByNameAndActiveTrue("ADMIN").orElseThrow();
        idDeAna = crear("ana", Set.of(user)).getId();
        idDeJefa = crear("jefa", Set.of(user, admin)).getId();
    }

    @AfterEach
    void limpiar() {
        usuarios.deleteAll();
    }

    private User crear(String alias, Set<Role> conRoles) {
        return usuarios.save(User.builder().name(alias).email(alias + "@biblioteca.ah").alias(alias)
                .password(cifrador.encode(CLAVE)).active(true).roles(new HashSet<>(conRoles)).build());
    }

    private MockHttpServletResponse llamar(String ruta, String token, Object cuerpo) throws Exception {
        MockHttpServletRequestBuilder p = post(ruta).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo == null ? "{}" : json.writeValueAsString(cuerpo));
        if (token != null) p.header("Authorization", "Bearer " + token);
        return mvc.perform(p).andReturn().getResponse();
    }

    private JsonNode cuerpo(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(StandardCharsets.UTF_8));
    }

    private String entrar(String alias) throws Exception {
        JsonNode r = cuerpo(llamar("/v1/auth/login", null, Map.of("usuario", alias, "password", CLAVE)));
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        return r.get("object").get("token").asText();
    }

    private void sigueValiendo(String token) throws Exception {
        MockHttpServletResponse r = llamar("/v1/auth/sesion", token, null);
        assertThat(r.getStatus()).isEqualTo(200);
        assertThat(cuerpo(r).get("object").asBoolean()).isTrue();
    }

    private void yaNoVale(String token) throws Exception {
        MockHttpServletResponse r = llamar("/v1/auth/sesion", token, null);
        assertThat(r.getStatus()).isEqualTo(401);
        assertThat(cuerpo(r).get("message").asText()).isEqualTo(REVOCADA);
        assertThat(cuerpo(r).get("errorCode").asInt()).isEqualTo(401);
    }

    @Nested
    @DisplayName("El token lleva la version de sesion")
    class Version {

        @Test
        @DisplayName("el login firma ver=0 en una cuenta nueva y el token vale")
        void claimVer() throws Exception {
            String token = entrar("ana");
            assertThat(JWT.decode(token).getClaim("ver").asInt()).isZero();
            assertThat(JWT.decode(token).getExpiresAt()).isNotNull();
            sigueValiendo(token);
        }

        @Test
        @DisplayName("renovar da un token nuevo con la misma version y los datos de la cuenta")
        void renovar() throws Exception {
            String token = entrar("ana");
            JsonNode r = cuerpo(llamar("/v1/auth/renovar", token, null));
            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.get("object").get("email").asText()).isEqualTo("ana@biblioteca.ah");
            assertThat(r.get("object").get("roles").get(0).asText()).isEqualTo("USER");
            String nuevo = r.get("object").get("token").asText();
            assertThat(JWT.decode(nuevo).getClaim("ver").asInt()).isZero();
            sigueValiendo(nuevo);
        }
    }

    @Nested
    @DisplayName("Revocacion")
    class Revocacion {

        @Test
        @DisplayName("desactivar la cuenta deja el token sin valor al instante, y reactivarla no lo resucita")
        void desactivar() throws Exception {
            String deAna = entrar("ana");
            String deJefa = entrar("jefa");

            assertThat(cuerpo(llamar("/v1/admin/users/" + idDeAna + "/deactivate", deJefa, null))
                    .get("correct").asBoolean()).isTrue();
            yaNoVale(deAna);
            assertThat(llamar("/v1/menu/mine", deAna, null).getStatus()).isEqualTo(401);

            llamar("/v1/admin/users/" + idDeAna + "/activate", deJefa, null);
            yaNoVale(deAna);
            sigueValiendo(entrar("ana"));
        }

        @Test
        @DisplayName("darse de baja uno mismo tambien revoca")
        void bajaPropia() throws Exception {
            String deAna = entrar("ana");
            llamar("/v1/users/delete/" + idDeAna, deAna, null);
            yaNoVale(deAna);
        }

        @Test
        @DisplayName("cambiar los roles revoca; volver a fijar los mismos no")
        void roles() throws Exception {
            String deAna = entrar("ana");
            String deJefa = entrar("jefa");

            llamar("/v1/admin/users/" + idDeAna + "/roles", deJefa, Map.of("roles", java.util.List.of("USER")));
            sigueValiendo(deAna);

            llamar("/v1/admin/users/" + idDeAna + "/roles", deJefa, Map.of("roles", java.util.List.of("USER", "ADMIN")));
            yaNoVale(deAna);
            assertThat(usuarios.findById(idDeAna).orElseThrow().getVersionSesion()).isEqualTo(1);
        }

        @Test
        @DisplayName("cambiar la propia clave revoca los tokens viejos y devuelve uno nuevo que si vale")
        void cambiarClave() throws Exception {
            String viejo = entrar("ana");
            JsonNode r = cuerpo(llamar("/v1/users/save", viejo, Map.of("id", idDeAna, "name", "ana",
                    "email", "ana@biblioteca.ah", "currentPassword", CLAVE, "password", "OtraClaveSegura7")));

            assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
            String nuevo = r.get("object").get("token").asText();
            assertThat(JWT.decode(nuevo).getClaim("ver").asInt()).isEqualTo(1);
            yaNoVale(viejo);
            sigueValiendo(nuevo);
        }

        @Test
        @DisplayName("editar el nombre sin tocar la clave no revoca ni devuelve token")
        void editarSinClave() throws Exception {
            String token = entrar("ana");
            JsonNode r = cuerpo(llamar("/v1/users/save", token, Map.of("id", idDeAna, "name", "Ana B",
                    "email", "ana@biblioteca.ah")));
            assertThat(r.get("object").has("token")).isFalse();
            sigueValiendo(token);
        }
    }

    @Nested
    @DisplayName("401 y 403 con el contrato (SE-11)")
    class Contrato {

        @Test
        @DisplayName("sin token: 401 con ResultDTO")
        void sinToken() throws Exception {
            MockHttpServletResponse r = llamar("/v1/menu/mine", null, null);
            assertThat(r.getStatus()).isEqualTo(401);
            assertThat(cuerpo(r).get("message").asText()).isEqualTo("Necesitas iniciar sesión.");
            assertThat(cuerpo(r).get("errorCode").asInt()).isEqualTo(401);
        }

        @Test
        @DisplayName("con token USER en administracion: 403 con ResultDTO")
        void sinRol() throws Exception {
            MockHttpServletResponse r = llamar("/v1/admin/users/all", entrar("ana"), Map.of("page", 0, "size", 10));
            assertThat(r.getStatus()).isEqualTo(403);
            assertThat(cuerpo(r).get("message").asText()).isEqualTo("No tienes permiso para hacer esto.");
            assertThat(cuerpo(r).get("errorCode").asInt()).isEqualTo(403);
        }
    }
}
