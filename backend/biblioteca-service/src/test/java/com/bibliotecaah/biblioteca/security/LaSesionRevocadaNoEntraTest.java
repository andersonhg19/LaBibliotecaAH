package com.bibliotecaah.biblioteca.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QA SE-02: con la cuenta desactivada (o los roles o la clave cambiados) el
 * token viejo seguia leyendo y escribiendo en biblioteca-service 10 dias.
 * Aqui un auth-service de mentira (HttpServer del JDK) decide que tokens
 * siguen vigentes, como hace el de verdad en POST /v1/auth/sesion.
 */
@DisplayName("Una sesion revocada en auth-service no entra en biblioteca-service")
class LaSesionRevocadaNoEntraTest {

    private static final String SECRETO = "secreto";

    /** Reloj que solo avanza cuando la prueba lo dice. */
    private static final class Reloj extends Clock {
        private Instant ahora = Instant.parse("2026-11-11T12:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId z) { return this; }
        @Override public Instant instant() { return ahora; }
    }

    private HttpServer auth;
    private final AtomicInteger llamadas = new AtomicInteger();
    private final List<String> autorizaciones = new ArrayList<>();
    private volatile int respuesta = 200;
    private Reloj reloj;
    private VigenciaDeSesiones vigencia;

    @BeforeEach
    void levantarAuth() throws Exception {
        auth = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        auth.createContext(VigenciaDeSesiones.RUTA, intercambio -> {
            llamadas.incrementAndGet();
            autorizaciones.add(intercambio.getRequestHeaders().getFirst("Authorization"));
            byte[] cuerpo = "{\"correct\":true}".getBytes(StandardCharsets.UTF_8);
            intercambio.sendResponseHeaders(respuesta, cuerpo.length);
            intercambio.getResponseBody().write(cuerpo);
            intercambio.close();
        });
        auth.start();
        reloj = new Reloj();
        vigencia = new VigenciaDeSesiones(cliente("http://127.0.0.1:" + auth.getAddress().getPort()), true,
                Duration.ofSeconds(30), reloj);
    }

    @AfterEach
    void parar() {
        auth.stop(0);
        SecurityContextHolder.clearContext();
    }

    private static RestClient cliente(String url) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(500);
        f.setReadTimeout(500);
        return RestClient.builder().baseUrl(url).requestFactory(f).build();
    }

    private static String token(long usuario, int version) {
        return JWT.create().withSubject("u@x").withClaim("userId", usuario).withClaim("ver", version)
                .withExpiresAt(new Date(System.currentTimeMillis() + 60_000)).sign(Algorithm.HMAC256(SECRETO));
    }

    @Nested
    @DisplayName("VigenciaDeSesiones")
    class Vigencia {

        @Test
        @DisplayName("pregunta a auth con el mismo token y guarda la respuesta 30 s")
        void cache() {
            String t = token(1, 0);
            assertThat(vigencia.vigente(1L, 0, t)).isTrue();
            assertThat(vigencia.vigente(1L, 0, t)).isTrue();
            assertThat(llamadas.get()).isEqualTo(1);
            assertThat(autorizaciones.get(0)).isEqualTo("Bearer " + t);

            respuesta = 401;
            reloj.ahora = reloj.ahora.plusSeconds(29);
            assertThat(vigencia.vigente(1L, 0, t)).as("aun en cache").isTrue();
            reloj.ahora = reloj.ahora.plusSeconds(2);
            assertThat(vigencia.vigente(1L, 0, t)).as("caducada la cache, auth dice 401").isFalse();
            assertThat(llamadas.get()).isEqualTo(2);

            reloj.ahora = reloj.ahora.plus(Duration.ofMinutes(9));
            assertThat(vigencia.vigente(1L, 0, t)).as("una revocada se recuerda 10 min").isFalse();
            assertThat(llamadas.get()).isEqualTo(2);
        }

        @Test
        @DisplayName("la clave es (usuario, version): una version nueva se pregunta aparte")
        void porVersion() {
            respuesta = 401;
            assertThat(vigencia.vigente(1L, 0, token(1, 0))).isFalse();
            respuesta = 200;
            assertThat(vigencia.vigente(1L, 1, token(1, 1))).isTrue();
            assertThat(vigencia.vigente(1L, null, token(1, 0))).as("sin claim = version 0").isFalse();
        }

        @Test
        @DisplayName("si auth no responde se deja pasar (con la firma ya comprobada) y se reintenta a los 5 s")
        void authCaido() {
            respuesta = 500;
            assertThat(vigencia.vigente(2L, 0, token(2, 0))).isTrue();
            auth.stop(0);
            reloj.ahora = reloj.ahora.plusSeconds(6);
            assertThat(vigencia.vigente(2L, 0, token(2, 0))).isTrue();
        }

        @Test
        @DisplayName("desactivada por configuracion, no pregunta")
        void apagada() {
            VigenciaDeSesiones apagada = new VigenciaDeSesiones(cliente("http://127.0.0.1:9"), false,
                    Duration.ofSeconds(30), reloj);
            assertThat(apagada.vigente(1L, 0, "x")).isTrue();
            assertThat(llamadas.get()).isZero();
        }
    }

    @Nested
    @DisplayName("El filtro JWT")
    class Filtro {

        private MockHttpServletResponse pasar(String token) throws Exception {
            SecParams p = new SecParams();
            ReflectionTestUtils.setField(p, "secret", SECRETO);
            JWTAuthorizationFilter filtro = new JWTAuthorizationFilter(p, vigencia);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/v1/libros/all");
            req.addHeader("Authorization", "Bearer " + token);
            MockHttpServletResponse res = new MockHttpServletResponse();
            filtro.doFilter(req, res, new MockFilterChain());
            return res;
        }

        @Test
        @DisplayName("token vigente: autentica con el userId del token")
        void vigente() throws Exception {
            MockHttpServletResponse r = pasar(token(7, 0));
            assertThat(r.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("token revocado: 401 con mensaje claro, sin llegar al controlador")
        void revocado() throws Exception {
            respuesta = 401;
            MockHttpServletResponse r = pasar(token(7, 0));
            assertThat(r.getStatus()).isEqualTo(401);
            assertThat(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(JWTAuthorizationFilter.SESION_REVOCADA);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }
    }
}
