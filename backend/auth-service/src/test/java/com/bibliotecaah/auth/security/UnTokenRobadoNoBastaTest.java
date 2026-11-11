package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
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

import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * QA A3, M3 y M7 de punta a punta, con la seguridad real puesta:
 *  · con un token robado no se cambia la contrasena sin saber la actual,
 *  · un usuario sin rol no crea cuentas por /v1/users/save,
 *  · el login se bloquea tras 5 fallos seguidos, incluso con la clave buena.
 */
@SpringBootTest
@DisplayName("Un token robado no basta para quedarse con la cuenta")
class UnTokenRobadoNoBastaTest {

    @Autowired private WebApplicationContext contexto;
    @Autowired private UserRepository usuarios;
    @Autowired private PasswordEncoder cifrador;
    @Value("${secret}") private String secreto;

    private MockMvc mvc;
    private Long idDeBruno;

    @BeforeEach
    void preparar() {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).apply(springSecurity()).build();
        usuarios.deleteAll();
        idDeBruno = usuarios.save(User.builder()
                .name("Bruno").email("bruno@biblioteca.ah").alias("bruno")
                .password(cifrador.encode("ClaveDeBruno1")).active(true).build())
                .getId();
    }

    private String comoBruno(String ruta, String cuerpo) throws Exception {
        String token = "Bearer " + JWT.create().withSubject("bruno@biblioteca.ah")
                .withClaim("userId", idDeBruno)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256(secreto));
        return mvc.perform(post(ruta).header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private String login(String correo, String clave) throws Exception {
        return mvc.perform(post("/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + correo + "\",\"password\":\"" + clave + "\"}"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private String claveGuardada() {
        return usuarios.findById(idDeBruno).orElseThrow().getPassword();
    }

    @Test
    @DisplayName("sin la contrasena actual, la contrasena no cambia")
    void sinClaveActual() throws Exception {
        String antes = claveGuardada();

        String r = comoBruno("/v1/users/save", "{\"id\":" + idDeBruno
                + ",\"name\":\"Bruno\",\"email\":\"bruno@biblioteca.ah\",\"password\":\"Cambiada999\"}");

        assertThat(r).contains("\"correct\":false");
        assertThat(claveGuardada()).as("cambiaron la clave sin conocer la actual").isEqualTo(antes);
    }

    @Test
    @DisplayName("con la contrasena actual correcta, si cambia")
    void conClaveActual() throws Exception {
        String r = comoBruno("/v1/users/save", "{\"id\":" + idDeBruno
                + ",\"name\":\"Bruno\",\"email\":\"bruno@biblioteca.ah\",\"password\":\"Cambiada999\","
                + "\"currentPassword\":\"ClaveDeBruno1\"}");

        assertThat(r).contains("\"correct\":true");
        assertThat(cifrador.matches("Cambiada999", claveGuardada())).isTrue();
    }

    @Test
    @DisplayName("la contrasena nueva debe tener 8 caracteres, letra y numero")
    void claveNuevaDebil() throws Exception {
        String antes = claveGuardada();

        String r = comoBruno("/v1/users/save", "{\"id\":" + idDeBruno
                + ",\"name\":\"Bruno\",\"email\":\"bruno@biblioteca.ah\",\"password\":\"123456\","
                + "\"currentPassword\":\"ClaveDeBruno1\"}");

        assertThat(r).contains("\"correct\":false").contains("'password'");
        assertThat(claveGuardada()).isEqualTo(antes);
    }

    @Test
    @DisplayName("un usuario sin rol no crea cuentas por /v1/users/save")
    void noCreaCuentas() throws Exception {
        long antes = usuarios.count();

        String r = comoBruno("/v1/users/save",
                "{\"name\":\"Colado\",\"email\":\"colado@biblioteca.ah\",\"password\":\"Clave12345x\"}");

        assertThat(r).contains("\"correct\":false");
        assertThat(usuarios.count()).as("Bruno dio de alta una cuenta").isEqualTo(antes);
    }

    @Test
    @DisplayName("tras 5 fallos el login se bloquea, aunque luego llegue la clave buena")
    void bloqueoDeLogin() throws Exception {
        /* Un correo propio: el limite es un bean compartido por el contexto
           de pruebas y no debe dejar bloqueado a nadie que usen otras clases. */
        usuarios.save(User.builder().name("Candado").email("candado@biblioteca.ah").alias("candado")
                .password(cifrador.encode("ClaveCandado1")).active(true).build());
        assertThat(login("candado@biblioteca.ah", "ClaveCandado1")).contains("token");

        for (int i = 0; i < 5; i++) {
            assertThat(login("candado@biblioteca.ah", "mala" + i))
                    .contains("\"errorCode\":101")
                    .contains("Correo/usuario o contraseña incorrectos");
        }

        assertThat(login("candado@biblioteca.ah", "ClaveCandado1"))
                .as("el sexto intento tenia que quedar bloqueado")
                .contains("\"errorCode\":429")
                .doesNotContain("token");
    }
}
