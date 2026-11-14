package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validacion web 0.4.0 (V-NUEVO-2): si la consulta de la sesion fallaba dentro del filtro JWT (base
 * lenta o caida un instante), Tomcat despachaba a /error, que en auth-service exigia sesion: el token
 * VALIDO recibia 401 «Necesitas iniciar sesión» y biblioteca lo tomaba por una revocacion. Con Tomcat
 * de verdad (MockMvc no despacha a /error).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DisplayName("V-NUEVO-2: un tropiezo de la base en /auth/sesion no es un 401")
class UnTropiezoNoEsUn401Test {

    @LocalServerPort private int puerto;
    @Autowired private SecParams secParams;
    @MockitoSpyBean private UserRepository usuarios;

    @Test
    @DisplayName("con la consulta de la sesion fallando, /auth/sesion responde 5xx y no 401")
    void tropiezo() throws Exception {
        Mockito.doThrow(new DataAccessResourceFailureException("la base no responde"))
                .when(usuarios).estadoDeSesion(Mockito.anyLong());
        String token = JWT.create().withSubject("ana@biblioteca.ah").withClaim("userId", 1L).withClaim("ver", 0)
                .withIssuedAt(new Date()).withExpiresAt(new Date(System.currentTimeMillis() + 60_000))
                .sign(Algorithm.HMAC256(secParams.getSecret()));

        HttpResponse<String> r = HttpClient.newHttpClient().send(HttpRequest.newBuilder(
                        URI.create("http://127.0.0.1:" + puerto + "/biblioteca/v1/auth/sesion"))
                .POST(HttpRequest.BodyPublishers.noBody()).header("Authorization", "Bearer " + token).build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(r.statusCode()).as(r.body()).isNotEqualTo(401).isGreaterThanOrEqualTo(500);
        assertThat(r.body()).doesNotContain("Necesitas iniciar sesión", "la base no responde", "Exception");
    }
}
