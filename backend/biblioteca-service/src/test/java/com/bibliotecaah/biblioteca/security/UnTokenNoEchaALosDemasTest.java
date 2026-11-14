package com.bibliotecaah.biblioteca.security;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import com.bibliotecaah.biblioteca.config.RestClientConfig;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validacion web 0.4.0 (V-NUEVO-2): un 401 con token valido cerraba la sesion, a veces en dos
 * navegadores de la misma cuenta a la vez. Lado servidor:
 *  · la cache de {@link VigenciaDeSesiones} iba por (usuario, version): UN token rechazado dejaba
 *    fuera 10 min a todos los tokens de la cuenta;
 *  · una rafaga al caducar la cache hacia una pregunta a auth por peticion;
 *  · un 401 de auth que no es suyo de rechazo (su entry point: el token no le llego) se tomaba por
 *    revocacion;
 *  · los 401 de biblioteca (firma, revocada, sin token) no dejaban rastro en el log;
 *  · un token con iat un poco "del futuro" (reloj corregido hacia atras) se rechazaba sin log.
 * Un auth-service de mentira (HttpServer del JDK) decide por token.
 */
@DisplayName("V-NUEVO-2: un token rechazado no echa a los demas dispositivos de la cuenta")
class UnTokenNoEchaALosDemasTest {

    private static final String SECRETO = "secreto-v-nuevo-2";
    private static final String AUTH_REVOCADA = "{\"correct\":false,\"message\":\"Tu sesión ya no es válida (la cuenta "
            + "cambió o se desactivó). Vuelve a iniciar sesión.\",\"errorCode\":401}";
    private static final String AUTH_SIN_SESION =
            "{\"correct\":false,\"message\":\"Necesitas iniciar sesión.\",\"errorCode\":401}";

    private static final class Reloj extends Clock {
        private volatile Instant ahora = Instant.parse("2026-11-14T08:44:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId z) { return this; }
        @Override public Instant instant() { return ahora; }
    }

    private record Respuesta(int estado, String cuerpo) { }

    private HttpServer auth;
    private final AtomicInteger llamadas = new AtomicInteger();
    /** Respuesta por token; el resto, 200. */
    private final Map<String, Respuesta> porToken = new ConcurrentHashMap<>();
    private volatile CountDownLatch freno;
    private Reloj reloj;
    private VigenciaDeSesiones vigencia;
    private ListAppender<ILoggingEvent> registro;
    private final List<Logger> conNivelCambiado = new ArrayList<>();

    @BeforeEach
    void levantar() throws Exception {
        auth = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        auth.setExecutor(Executors.newFixedThreadPool(8));
        auth.createContext(VigenciaDeSesiones.RUTA, intercambio -> {
            llamadas.incrementAndGet();
            try {
                CountDownLatch f = freno;
                if (f != null) f.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            String token = intercambio.getRequestHeaders().getFirst("Authorization").substring("Bearer ".length());
            Respuesta r = porToken.getOrDefault(token, new Respuesta(200, "{\"correct\":true}"));
            byte[] cuerpo = r.cuerpo().getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(r.estado(), cuerpo.length);
            intercambio.getResponseBody().write(cuerpo);
            intercambio.close();
        });
        auth.start();
        reloj = new Reloj();
        /* El mismo cliente que en produccion (RestClientConfig.clienteDeAuth). */
        vigencia = new VigenciaDeSesiones(new RestClientConfig().clienteDeAuth(
                "http://127.0.0.1:" + auth.getAddress().getPort(), 8000), true, Duration.ofSeconds(30), reloj);
        registro = new ListAppender<>();
        registro.start();
        for (Class<?> c : List.of(VigenciaDeSesiones.class, JWTAuthorizationFilter.class, SecurityConfig.class)) {
            Logger l = (Logger) LoggerFactory.getLogger(c);
            l.setLevel(Level.INFO);
            l.setAdditive(false);
            l.addAppender(registro);
            conNivelCambiado.add(l);
        }
    }

    @AfterEach
    void parar() {
        auth.stop(0);
        SecurityContextHolder.clearContext();
        for (Logger l : conNivelCambiado) {
            l.detachAppender(registro);
            l.setLevel(null);
            l.setAdditive(true);
        }
    }

    private static String token(long usuario, int version, String dispositivo) {
        return JWT.create().withSubject("u@x").withClaim("userId", usuario).withClaim("ver", version)
                .withClaim("dispositivo", dispositivo)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000)).sign(Algorithm.HMAC256(SECRETO));
    }

    private List<String> avisos() {
        return registro.list.stream().filter(e -> e.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage).toList();
    }

    @Nested
    @DisplayName("VigenciaDeSesiones")
    class Vigencia {

        @Test
        @DisplayName("dos dispositivos de la misma cuenta y version: el rechazo de uno no envenena al otro")
        void dosDispositivos() {
            String malo = token(5, 0, "telefono");
            String bueno = token(5, 0, "portatil");
            porToken.put(malo, new Respuesta(401, AUTH_REVOCADA));

            assertThat(vigencia.vigente(5L, 0, malo)).isFalse();
            assertThat(vigencia.vigente(5L, 0, bueno)).as("el otro dispositivo sigue dentro").isTrue();
            assertThat(vigencia.vigente(5L, 0, malo)).as("el rechazado se recuerda").isFalse();
            assertThat(llamadas.get()).isEqualTo(2);
        }

        @Test
        @DisplayName("una rafaga con el mismo token al caducar la cache hace UNA sola pregunta a auth")
        void rafaga() throws Exception {
            String t = token(6, 0, "web");
            freno = new CountDownLatch(1);
            ExecutorService hilos = Executors.newFixedThreadPool(20);
            try {
                List<Future<Boolean>> respuestas = new ArrayList<>();
                for (int i = 0; i < 20; i++) respuestas.add(hilos.submit(() -> vigencia.vigente(6L, 0, t)));
                /* Que las 20 lleguen mientras la primera pregunta sigue en vuelo. */
                long hasta = System.currentTimeMillis() + 3000;
                while (llamadas.get() == 0 && System.currentTimeMillis() < hasta) Thread.sleep(5);
                Thread.sleep(300);
                freno.countDown();
                for (Future<Boolean> r : respuestas) assertThat(r.get(10, TimeUnit.SECONDS)).isTrue();
            } finally {
                hilos.shutdownNow();
            }
            assertThat(llamadas.get()).isEqualTo(1);
        }

        @Test
        @DisplayName("el 401 «Necesitas iniciar sesión» de auth (no vio el token) no es una revocacion: pasa y se "
                + "reintenta a los 5 s")
        void sinSesionDeAuthNoRevoca() {
            String t = token(7, 0, "web");
            porToken.put(t, new Respuesta(401, AUTH_SIN_SESION));
            assertThat(vigencia.vigente(7L, 0, t)).isTrue();
            assertThat(vigencia.vigente(7L, 0, t)).isTrue();
            assertThat(llamadas.get()).isEqualTo(1);
            reloj.ahora = reloj.ahora.plusSeconds(6);
            porToken.remove(t);
            assertThat(vigencia.vigente(7L, 0, t)).isTrue();
            assertThat(llamadas.get()).isEqualTo(2);
            assertThat(avisos()).anySatisfy(a -> assertThat(a).contains("401 sin ver el token", "usuario 7")
                    .doesNotContain(t));
        }

        @Test
        @DisplayName("un 401 de revocacion queda en WARN con estado, cuerpo resumido y huella, nunca el token")
        void avisoDeRevocacion() {
            String t = token(8, 3, "web");
            porToken.put(t, new Respuesta(401, AUTH_REVOCADA));
            assertThat(vigencia.vigente(8L, 3, t)).isFalse();
            assertThat(avisos()).anySatisfy(a -> assertThat(a)
                    .contains("Sesion revocada en auth-service", "usuario 8", "401", "ya no es válida",
                            VigenciaDeSesiones.huella(t))
                    .doesNotContain(t));
        }

        @Test
        @DisplayName("la clave lleva sha256 truncado del token (16 hex), no el token")
        void clave() {
            String t = token(9, 1, "web");
            String clave = VigenciaDeSesiones.clave(9L, 1, t);
            assertThat(clave).startsWith("9:1:").hasSize("9:1:".length() + 16).doesNotContain(t);
            assertThat(VigenciaDeSesiones.clave(9L, null, t)).isEqualTo(VigenciaDeSesiones.clave(9L, 0, t));
            assertThat(VigenciaDeSesiones.huella(t)).isNotEqualTo(VigenciaDeSesiones.huella(t + "x"));
            assertThat(VigenciaDeSesiones.huella(null)).hasSize(16);
        }

        @Test
        @DisplayName("el cuerpo del log va en una linea y cortado")
        void resumen() {
            assertThat(VigenciaDeSesiones.resumen(null)).isEqualTo("(sin cuerpo)");
            assertThat(VigenciaDeSesiones.resumen("  ")).isEqualTo("(sin cuerpo)");
            assertThat(VigenciaDeSesiones.resumen("{\n\"a\":  1}")).isEqualTo("{ \"a\": 1}");
            assertThat(VigenciaDeSesiones.resumen("x".repeat(500))).hasSize(161).endsWith("…");
        }
    }

    @Nested
    @DisplayName("El filtro JWT y el entry point")
    class Filtro {

        private MockHttpServletResponse pasar(String cabecera) throws Exception {
            SecParams p = new SecParams();
            ReflectionTestUtils.setField(p, "secret", SECRETO);
            JWTAuthorizationFilter filtro = new JWTAuthorizationFilter(p, vigencia);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/biblioteca/v1/libros/get");
            if (cabecera != null) req.addHeader("Authorization", cabecera);
            MockHttpServletResponse res = new MockHttpServletResponse();
            filtro.doFilter(req, res, new MockFilterChain());
            return res;
        }

        @Test
        @DisplayName("un token valido con iat 90 s «del futuro» (reloj corregido hacia atras) entra")
        void iatDelFuturo() throws Exception {
            String t = JWT.create().withSubject("u@x").withClaim("userId", 10L).withClaim("ver", 0)
                    .withIssuedAt(new Date(System.currentTimeMillis() + 90_000))
                    .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000)).sign(Algorithm.HMAC256(SECRETO));
            assertThat(pasar("Bearer " + t).getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("un token caducado sigue fuera, y el WARN dice el tipo y la ruta sin el token")
        void caducado() throws Exception {
            String t = JWT.create().withSubject("u@x").withClaim("userId", 10L)
                    .withExpiresAt(new Date(System.currentTimeMillis() - 60_000)).sign(Algorithm.HMAC256(SECRETO));
            MockHttpServletResponse r = pasar("Bearer " + t);
            assertThat(r.getStatus()).isEqualTo(401);
            assertThat(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(JWTAuthorizationFilter.TOKEN_INVALIDO);
            assertThat(avisos()).anySatisfy(a -> assertThat(a)
                    .contains("Token rechazado en POST /biblioteca/v1/libros/get", "TokenExpiredException")
                    .doesNotContain(t));
        }

        @Test
        @DisplayName("un token mal formado: WARN solo con el tipo (el mensaje podria copiar el token)")
        void malFormado() throws Exception {
            assertThat(pasar("Bearer no-es-un-jwt").getStatus()).isEqualTo(401);
            assertThat(avisos()).anySatisfy(a -> assertThat(a).endsWith(": JWTDecodeException")
                    .doesNotContain("no-es-un-jwt"));
        }

        @Test
        @DisplayName("firma de otro secreto: WARN con SignatureVerificationException")
        void otraFirma() throws Exception {
            String t = JWT.create().withClaim("userId", 1L)
                    .withExpiresAt(new Date(System.currentTimeMillis() + 60_000)).sign(Algorithm.HMAC256("otro"));
            assertThat(pasar("Bearer " + t).getStatus()).isEqualTo(401);
            assertThat(avisos()).anySatisfy(a -> assertThat(a).contains("SignatureVerificationException"));
        }

        @Test
        @DisplayName("revocado: WARN con la ruta, el usuario y la huella")
        void revocado() throws Exception {
            String t = token(11, 0, "web");
            porToken.put(t, new Respuesta(401, AUTH_REVOCADA));
            MockHttpServletResponse r = pasar("Bearer " + t);
            assertThat(r.getStatus()).isEqualTo(401);
            assertThat(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(JWTAuthorizationFilter.SESION_REVOCADA);
            assertThat(avisos()).anySatisfy(a -> assertThat(a)
                    .contains("Token rechazado en POST /biblioteca/v1/libros/get: sesion revocada", "usuario 11")
                    .doesNotContain(t));
        }

        @Test
        @DisplayName("entry point: 401 sin cuerpo y WARN con la ruta y que cabecera llego")
        void entryPoint() {
            for (String cabecera : new String[]{null, "Bearer x", "Basic y"}) {
                MockHttpServletRequest req = new MockHttpServletRequest("POST", "/biblioteca/v1/voces/all");
                if (cabecera != null) req.addHeader("Authorization", cabecera);
                MockHttpServletResponse res = new MockHttpServletResponse();
                SecurityConfig.sinSesion(req, res);
                assertThat(res.getStatus()).isEqualTo(401);
                assertThat(res.getContentLength()).isZero();
            }
            assertThat(avisos()).containsExactly(
                    "Peticion sin sesion en POST /biblioteca/v1/voces/all (dispatch REQUEST): sin cabecera Authorization",
                    "Peticion sin sesion en POST /biblioteca/v1/voces/all (dispatch REQUEST): con Bearer (el token no llego al filtro)",
                    "Peticion sin sesion en POST /biblioteca/v1/voces/all (dispatch REQUEST): cabecera Authorization sin Bearer");
        }
    }
}
