package com.bibliotecaah.auth.consultas;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * ============================================================================
 * INICIAR SESION CON CORREO O ALIAS, DE PUNTA A PUNTA
 * ============================================================================
 *
 * Con la aplicacion entera levantada (seguridad real, Flyway real hasta V3,
 * limite de intentos real) y por HTTP. Las mismas pruebas corren dos veces:
 * sobre H2 (ElLoginConCorreoOAliasEnH2Test, siempre) y sobre PostgreSQL 14
 * (ElLoginConCorreoOAliasEnPostgresTest, con Docker), porque la busqueda por
 * correo sin distinguir mayusculas es una @Query y H2 no es PostgreSQL.
 *
 * Los mensajes se comprueban EXACTOS: que el de "no existe" y el de "clave
 * mala" sean el mismo es la mitad de la prueba.
 */
@SpringBootTest
abstract class LoginConCorreoOAlias {

    static final String CREDENCIALES = "Correo/usuario o contraseña incorrectos";
    static final String CLAVE = "Clave12345x";
    static final String INVALIDO = "El usuario debe tener de 3 a 30 caracteres: letras sin tilde, números, "
            + "punto (.), guion (-) o guion bajo (_). Sin espacios ni @.";

    @Autowired private WebApplicationContext contexto;
    @Autowired private UserRepository usuarios;
    @Autowired private PasswordEncoder cifrador;
    @Autowired private ObjectMapper json;
    @Value("${secret}") private String secreto;

    private MockMvc mvc;
    private Long idDeAnderson;

    @BeforeEach
    void preparar() {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).apply(springSecurity()).build();
        usuarios.deleteAll();
        idDeAnderson = crear("Anderson", "anderson@biblioteca.ah", "anderson").getId();
    }

    /* En PostgreSQL la base es compartida con las demas pruebas de consultas:
       se deja vacia al salir. */
    @AfterEach
    void limpiar() {
        usuarios.deleteAll();
    }

    private User crear(String nombre, String correo, String alias) {
        return usuarios.save(User.builder().name(nombre).email(correo).alias(alias)
                .password(cifrador.encode(CLAVE)).active(true).build());
    }

    private JsonNode llamar(String ruta, String cuerpo, String token) throws Exception {
        var peticion = post(ruta).contentType(MediaType.APPLICATION_JSON).content(cuerpo);
        if (token != null) {
            peticion.header("Authorization", "Bearer " + token);
        }
        String respuesta = mvc.perform(peticion).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return json.readTree(respuesta);
    }

    private JsonNode entrar(String usuario, String clave) throws Exception {
        return llamar("/v1/auth/login", json.writeValueAsString(Map.of("usuario", usuario, "password", clave)), null);
    }

    private String tokenDeAdmin() {
        return JWT.create().withSubject("anderson@biblioteca.ah").withClaim("userId", idDeAnderson)
                .withArrayClaim("roles", new String[]{"ADMIN", "USER"})
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256(secreto));
    }

    // ========================================================================

    @Test
    @DisplayName("por alias entra, y el token es el de siempre: sub = correo y userId de la cuenta")
    void porAlias() throws Exception {
        JsonNode r = entrar("anderson", CLAVE);

        assertThat(r.get("correct").asBoolean()).isTrue();
        assertThat(r.at("/object/email").asText()).isEqualTo("anderson@biblioteca.ah");
        assertThat(r.at("/object/alias").asText()).isEqualTo("anderson");
        DecodedJWT token = JWT.require(Algorithm.HMAC256(secreto)).build().verify(r.at("/object/token").asText());
        assertThat(token.getSubject()).isEqualTo("anderson@biblioteca.ah");
        assertThat(token.getClaim("userId").asLong()).isEqualTo(idDeAnderson);
    }

    @Test
    @DisplayName("por correo entra igual")
    void porCorreo() throws Exception {
        JsonNode r = entrar("anderson@biblioteca.ah", CLAVE);

        assertThat(r.get("correct").asBoolean()).isTrue();
        assertThat(r.at("/object/userId").asLong()).isEqualTo(idDeAnderson);
    }

    @Test
    @DisplayName("mayusculas y espacios no importan, ni en el alias ni en el correo")
    void mayusculasYEspacios() throws Exception {
        assertThat(entrar("  ANDERSON ", CLAVE).get("correct").asBoolean()).isTrue();
        assertThat(entrar(" Anderson@Biblioteca.AH  ", CLAVE).get("correct").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("el campo viejo 'email' sigue funcionando, tambien con un alias dentro")
    void campoEmailRetrocompatible() throws Exception {
        JsonNode r = llamar("/v1/auth/login", "{\"email\":\"anderson\",\"password\":\"" + CLAVE + "\"}", null);

        assertThat(r.get("correct").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("alias inexistente y clave mala dan EXACTAMENTE la misma respuesta")
    void sinEnumeracion() throws Exception {
        JsonNode inexistente = entrar("nadie" + UUID.randomUUID().toString().substring(0, 8), CLAVE);
        JsonNode claveMala = entrar("anderson", "NoEsLaClave1");

        assertThat(inexistente.get("correct").asBoolean()).isFalse();
        assertThat(inexistente.get("errorCode").asInt()).isEqualTo(101);
        assertThat(inexistente.get("message").asText()).isEqualTo(CREDENCIALES);
        assertThat(claveMala).isEqualTo(inexistente);
    }

    @Test
    @DisplayName("una cuenta desactivada no entra ni por correo ni por alias")
    void desactivada() throws Exception {
        User vieja = crear("Vieja", "vieja@biblioteca.ah", "vieja");
        vieja.setActive(false);
        usuarios.save(vieja);

        assertThat(entrar("vieja", CLAVE).get("message").asText()).isEqualTo(CREDENCIALES);
        assertThat(entrar("vieja@biblioteca.ah", CLAVE).get("message").asText()).isEqualTo(CREDENCIALES);
    }

    @Test
    @DisplayName("el limite es de la cuenta: 3 fallos por correo + 2 por alias bloquean las dos vias")
    void limiteCompartido() throws Exception {
        crear("Samy", "samy@biblioteca.ah", "samy");
        for (int i = 0; i < 3; i++) {
            assertThat(entrar("samy@biblioteca.ah", "mala" + i).get("errorCode").asInt()).isEqualTo(101);
        }
        for (int i = 0; i < 2; i++) {
            assertThat(entrar("SAMY", "mala" + i).get("errorCode").asInt()).isEqualTo(101);
        }

        assertThat(entrar("samy", CLAVE).get("errorCode").asInt())
                .as("con 5 fallos repartidos entre correo y alias, ni la clave buena entra")
                .isEqualTo(429);
        assertThat(entrar("samy@biblioteca.ah", CLAVE).get("errorCode").asInt()).isEqualTo(429);
        assertThat(entrar("anderson", CLAVE).get("correct").asBoolean())
                .as("otra cuenta no se ve afectada").isTrue();
    }

    @Test
    @DisplayName("registro con alias: nace con el normalizado y se puede entrar con el")
    void registroConAlias() throws Exception {
        JsonNode r = llamar("/v1/auth/register", "{\"name\":\"Lectora\",\"email\":\"lectora@biblioteca.ah\","
                + "\"alias\":\" Lectora.AH \",\"password\":\"" + CLAVE + "\"}", null);

        assertThat(r.get("correct").asBoolean()).isTrue();
        assertThat(r.at("/object/alias").asText()).isEqualTo("lectora.ah");
        assertThat(entrar("lectora.ah", CLAVE).get("correct").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("registro con alias duplicado (otra mayuscula), invalido o con @: rechazado y sin cuenta")
    void registroRechazado() throws Exception {
        String base = "{\"name\":\"Otra\",\"email\":\"otra@biblioteca.ah\",\"password\":\"" + CLAVE + "\",\"alias\":";

        JsonNode duplicado = llamar("/v1/auth/register", base + "\"ANDERSON\"}", null);
        assertThat(duplicado.get("errorCode").asInt()).isEqualTo(112);
        assertThat(duplicado.get("message").asText())
                .isEqualTo("Ese nombre de usuario ya está en uso. Prueba con otro.");

        for (String malo : List.of("ab", "otra lectora", "otra@biblioteca.ah", "lectoría")) {
            JsonNode r = llamar("/v1/auth/register", base + "\"" + malo + "\"}", null);
            assertThat(r.get("errorCode").asInt()).as(malo).isEqualTo(400);
            assertThat(r.get("message").asText()).as(malo).isEqualTo(INVALIDO);
        }
        assertThat(usuarios.findByEmail("otra@biblioteca.ah")).isEmpty();
    }

    @Test
    @DisplayName("un administrador edita el alias de otra cuenta: entra con el nuevo y ya no con el viejo")
    void adminEditaAlias() throws Exception {
        Long idDeSamy = crear("Samy", "samy@biblioteca.ah", "samy").getId();

        JsonNode r = llamar("/v1/admin/users/save", "{\"id\":" + idDeSamy + ",\"name\":\"Samy\","
                + "\"email\":\"samy@biblioteca.ah\",\"alias\":\"Samy.H\"}", tokenDeAdmin());

        assertThat(r.get("correct").asBoolean()).isTrue();
        assertThat(r.at("/object/alias").asText()).isEqualTo("samy.h");
        assertThat(entrar("samy.h", CLAVE).get("correct").asBoolean()).isTrue();
        assertThat(entrar("samy", CLAVE).get("message").asText()).isEqualTo(CREDENCIALES);
    }

    @Test
    @DisplayName("si la edicion de administracion no trae alias, la cuenta conserva el suyo")
    void adminConservaAlias() throws Exception {
        Long idDeSamy = crear("Samy", "samy@biblioteca.ah", "samy").getId();

        JsonNode r = llamar("/v1/admin/users/save", "{\"id\":" + idDeSamy + ",\"name\":\"Samy R\","
                + "\"email\":\"samy@biblioteca.ah\"}", tokenDeAdmin());

        assertThat(r.at("/object/name").asText()).isEqualTo("Samy R");
        assertThat(r.at("/object/alias").asText()).isEqualTo("samy");
    }
}
