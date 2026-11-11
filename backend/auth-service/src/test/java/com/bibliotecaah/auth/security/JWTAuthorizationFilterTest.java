package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTCreator;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.repository.EstadoDeSesion;
import com.bibliotecaah.auth.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Date;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("Filtro JWT de auth-service")
class JWTAuthorizationFilterTest {

    private static final String SECRETO = "test-secret-key";

    @Mock private SecParams secParams;
    @Mock private UserRepository usuarios;
    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;
    @Mock private FilterChain filterChain;

    private JWTAuthorizationFilter filter;
    private StringWriter cuerpo;

    @BeforeEach
    void setUp() throws Exception {
        filter = new JWTAuthorizationFilter(secParams, usuarios);
        SecurityContextHolder.clearContext();
        when(secParams.getSecret()).thenReturn(SECRETO);
        cuerpo = new StringWriter();
        when(response.getWriter()).thenReturn(new PrintWriter(cuerpo));
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    private static JWTCreator.Builder base(long userId) {
        return JWT.create().withSubject("ana@biblioteca.ah").withClaim("userId", userId)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000));
    }

    private void conToken(String token) {
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
    }

    private void cuenta(long id, boolean activa, int version) {
        when(usuarios.estadoDeSesion(id)).thenReturn(Optional.of(new EstadoDeSesion(activa, version)));
    }

    private void esperaRechazo(String mensaje) throws Exception {
        filter.doFilterInternal(request, response, filterChain);
        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(filterChain, never()).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(cuerpo.toString()).contains("\"errorCode\":401").contains(mensaje);
    }

    @Nested
    @DisplayName("Sin token")
    class SinToken {

        @Test
        @DisplayName("sin cabecera pasa sin autenticar")
        void sinCabecera() throws Exception {
            when(request.getHeader("Authorization")).thenReturn(null);
            filter.doFilterInternal(request, response, filterChain);
            verify(filterChain).doFilter(request, response);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("una cabecera que no es Bearer pasa sin autenticar")
        void noBearer() throws Exception {
            when(request.getHeader("Authorization")).thenReturn("Basic abc123");
            filter.doFilterInternal(request, response, filterChain);
            verify(filterChain).doFilter(request, response);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }
    }

    @Nested
    @DisplayName("Token valido y vigente")
    class Vigente {

        @Test
        @DisplayName("autentica con el correo, el userId en los detalles y los roles del claim")
        void autentica() throws Exception {
            cuenta(3L, true, 2);
            conToken(base(3L).withClaim("ver", 2).withArrayClaim("roles", new String[]{"ADMIN", "USER"})
                    .sign(Algorithm.HMAC256(SECRETO)));

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            var auth = SecurityContextHolder.getContext().getAuthentication();
            assertThat(auth.getPrincipal()).isEqualTo("ana@biblioteca.ah");
            assertThat(auth.getDetails()).isEqualTo(3L);
            assertThat(auth.getAuthorities()).extracting(a -> a.getAuthority()).containsExactly("ADMIN", "USER");
        }

        @Test
        @DisplayName("un token anterior a V4 (sin claim ver) vale como version 0 y sin roles")
        void tokenAntiguo() throws Exception {
            cuenta(4L, true, 0);
            conToken(base(4L).sign(Algorithm.HMAC256(SECRETO)));

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities()).isEmpty();
        }
    }

    @Nested
    @DisplayName("Token rechazado con 401 JSON")
    class Rechazado {

        @Test
        @DisplayName("firma invalida")
        void firmaInvalida() throws Exception {
            conToken("no-es-un-token");
            esperaRechazo("Sesión inválida o vencida");
            verify(response).setContentType("application/json;charset=UTF-8");
        }

        @Test
        @DisplayName("caducado")
        void caducado() throws Exception {
            conToken(JWT.create().withSubject("x").withClaim("userId", 1L)
                    .withExpiresAt(new Date(System.currentTimeMillis() - 1000)).sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Sesión inválida o vencida");
        }

        @Test
        @DisplayName("sin exp (QA SE-18)")
        void sinExp() throws Exception {
            conToken(JWT.create().withSubject("x").withClaim("userId", 1L).sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Sesión inválida o vencida");
        }

        @Test
        @DisplayName("sin userId (QA SE-18)")
        void sinUserId() throws Exception {
            conToken(JWT.create().withSubject("x").withExpiresAt(new Date(System.currentTimeMillis() + 60_000))
                    .sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Sesión inválida o vencida");
        }

        @Test
        @DisplayName("cuenta desactivada (QA SE-02)")
        void cuentaDesactivada() throws Exception {
            cuenta(3L, false, 0);
            conToken(base(3L).withClaim("ver", 0).sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Tu sesión ya no es válida");
        }

        @Test
        @DisplayName("version de sesion vieja: roles o clave cambiados (QA SE-02)")
        void versionVieja() throws Exception {
            cuenta(3L, true, 1);
            conToken(base(3L).withClaim("ver", 0).sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Tu sesión ya no es válida");
        }

        @Test
        @DisplayName("cuenta que ya no existe")
        void cuentaInexistente() throws Exception {
            when(usuarios.estadoDeSesion(9L)).thenReturn(Optional.empty());
            conToken(base(9L).sign(Algorithm.HMAC256(SECRETO)));
            esperaRechazo("Tu sesión ya no es válida");
        }
    }
}
