package com.bibliotecaah.auth.security;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.EstadoDeSesion;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validacion web 0.4.0 (V-NUEVO-2): caminos de auth-service que podian dar 401 a un token valido en
 * POST /v1/auth/sesion, y el rastro que deja cada rechazo (sin el token).
 */
@DisplayName("V-NUEVO-2: un token valido no da 401 en auth-service y cada rechazo deja WARN")
class UnTokenValidoNoDa401Test {

    private static final String SECRETO = "secreto-v-nuevo-2";

    private UserRepository usuarios;
    private JWTAuthorizationFilter filtro;
    private ListAppender<ILoggingEvent> registro;
    private Logger[] registradores;

    @BeforeEach
    void preparar() {
        SecParams params = Mockito.mock(SecParams.class);
        Mockito.when(params.getSecret()).thenReturn(SECRETO);
        Mockito.when(params.getExpiredTime()).thenReturn(86_400_000L);
        usuarios = Mockito.mock(UserRepository.class);
        Mockito.when(usuarios.estadoDeSesion(5L)).thenReturn(Optional.of(new EstadoDeSesion(true, 2)));
        filtro = new JWTAuthorizationFilter(params, usuarios);
        registro = new ListAppender<>();
        registro.start();
        registradores = new Logger[]{(Logger) LoggerFactory.getLogger(JWTAuthorizationFilter.class),
                (Logger) LoggerFactory.getLogger(SecurityConfig.class)};
        for (Logger l : registradores) {
            l.setLevel(Level.INFO);
            l.setAdditive(false);
            l.addAppender(registro);
        }
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        for (Logger l : registradores) {
            l.detachAppender(registro);
            l.setLevel(null);
            l.setAdditive(true);
        }
    }

    private MockHttpServletResponse sesion(String cabecera) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/biblioteca/v1/auth/sesion");
        if (cabecera != null) req.addHeader("Authorization", cabecera);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filtro.doFilter(req, res, new MockFilterChain());
        return res;
    }

    private List<String> avisos() {
        return registro.list.stream().filter(e -> e.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static User ana() {
        User u = new User();
        u.setId(5L);
        u.setEmail("ana@biblioteca.ah");
        u.setName("Ana");
        u.setVersionSesion(2);
        return u;
    }

    @Test
    @DisplayName("un token emitido por un reloj 2 s por delante (o con el reloj corregido hacia atras) entra")
    void iatDelFuturo() throws Exception {
        SecParams params = Mockito.mock(SecParams.class);
        Mockito.when(params.getSecret()).thenReturn(SECRETO);
        Mockito.when(params.getExpiredTime()).thenReturn(86_400_000L);
        EmisorDeTokens adelantado = new EmisorDeTokens(params,
                Clock.fixed(Instant.now().plusSeconds(2), ZoneOffset.UTC));
        String token = adelantado.emitir(ana(), List.of("USER"));

        MockHttpServletResponse r = sesion("Bearer " + token);

        assertThat(r.getStatus()).as(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        assertThat(avisos()).isEmpty();
    }

    @Test
    @DisplayName("un token recien emitido en el mismo milisegundo que se comprueba entra (iat = ahora)")
    void mismoInstante() throws Exception {
        SecParams params = Mockito.mock(SecParams.class);
        Mockito.when(params.getSecret()).thenReturn(SECRETO);
        Mockito.when(params.getExpiredTime()).thenReturn(86_400_000L);
        for (int i = 0; i < 50; i++) {
            String token = new EmisorDeTokens(params).emitir(ana(), List.of("USER"));
            assertThat(sesion("Bearer " + token).getStatus()).isEqualTo(200);
        }
    }

    @Test
    @DisplayName("caducado: 401 TOKEN_INVALIDO y WARN con el tipo y la ruta, sin el token")
    void caducado() throws Exception {
        String token = JWT.create().withClaim("userId", 5L).withClaim("ver", 2)
                .withExpiresAt(new Date(System.currentTimeMillis() - 1000)).sign(Algorithm.HMAC256(SECRETO));
        MockHttpServletResponse r = sesion("Bearer " + token);
        assertThat(r.getStatus()).isEqualTo(401);
        assertThat(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(JWTAuthorizationFilter.TOKEN_INVALIDO);
        assertThat(avisos()).singleElement().satisfies(a -> assertThat(a)
                .startsWith("Token rechazado en POST /biblioteca/v1/auth/sesion: TokenExpiredException")
                .doesNotContain(token));
    }

    @Test
    @DisplayName("mal formado: WARN solo con el tipo de excepcion")
    void malFormado() throws Exception {
        assertThat(sesion("Bearer basura").getStatus()).isEqualTo(401);
        assertThat(avisos()).containsExactly("Token rechazado en POST /biblioteca/v1/auth/sesion: JWTDecodeException");
    }

    @Test
    @DisplayName("version vieja: 401 SESION_REVOCADA y WARN con usuario y version (antes INFO)")
    void versionVieja() throws Exception {
        String token = JWT.create().withClaim("userId", 5L).withClaim("ver", 1)
                .withExpiresAt(new Date(System.currentTimeMillis() + 60_000)).sign(Algorithm.HMAC256(SECRETO));
        MockHttpServletResponse r = sesion("Bearer " + token);
        assertThat(r.getStatus()).isEqualTo(401);
        assertThat(r.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(JWTAuthorizationFilter.SESION_REVOCADA);
        assertThat(avisos()).containsExactly("Token rechazado en POST /biblioteca/v1/auth/sesion: sesion revocada "
                + "o cuenta inactiva (usuario 5, ver 1)");
    }

    @Test
    @DisplayName("entry point: 401 SIN_SESION y WARN con la ruta, el despacho y que cabecera llego")
    void entryPoint() throws Exception {
        for (String cabecera : new String[]{null, "Bearer x", "Basic y"}) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/biblioteca/v1/users/me");
            if (cabecera != null) req.addHeader("Authorization", cabecera);
            MockHttpServletResponse res = new MockHttpServletResponse();
            SecurityConfig.sinSesion(req, res);
            assertThat(res.getStatus()).isEqualTo(401);
            assertThat(res.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(SecurityConfig.SIN_SESION);
        }
        assertThat(avisos()).containsExactly(
                "Peticion sin sesion en POST /biblioteca/v1/users/me (dispatch REQUEST): sin cabecera Authorization",
                "Peticion sin sesion en POST /biblioteca/v1/users/me (dispatch REQUEST): con Bearer (el token no llego al filtro)",
                "Peticion sin sesion en POST /biblioteca/v1/users/me (dispatch REQUEST): cabecera Authorization sin Bearer");
    }
}
