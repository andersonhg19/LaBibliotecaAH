package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.PrintWriter;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JWTAuthorizationFilterTest {

    @Mock
    private SecParams secParams;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private FilterChain filterChain;

    private JWTAuthorizationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JWTAuthorizationFilter(secParams);
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Should pass through when no Authorization header")
    void shouldPassWithoutAuthHeader() throws Exception {
        when(request.getHeader("Authorization")).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("Should pass through when Authorization header is not Bearer")
    void shouldPassWithNonBearerHeader() throws Exception {
        when(request.getHeader("Authorization")).thenReturn("Basic abc123");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("Should authenticate with valid JWT")
    void shouldAuthenticateWithValidJWT() throws Exception {
        String secret = "test-secret-key";
        String token = JWT.create()
                .withSubject("test@biblioteca.ah")
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .sign(Algorithm.HMAC256(secret));

        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(secParams.getSecret()).thenReturn(secret);

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("test@biblioteca.ah",
                SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    }

    @Test
    @DisplayName("Should return 401 with invalid JWT")
    void shouldClearContextWithInvalidJWT() throws Exception {
        PrintWriter writer = mock(PrintWriter.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer invalid-token");
        when(secParams.getSecret()).thenReturn("test-secret-key");
        when(response.getWriter()).thenReturn(writer);

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(response).setContentType("application/json");
        verify(writer).write(anyString());
        verify(filterChain, never()).doFilter(request, response);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("Should return 401 with expired JWT")
    void shouldClearContextWithExpiredJWT() throws Exception {
        PrintWriter writer = mock(PrintWriter.class);
        String secret = "test-secret-key";
        String token = JWT.create()
                .withSubject("test@biblioteca.ah")
                .withExpiresAt(new Date(System.currentTimeMillis() - 1000))
                .sign(Algorithm.HMAC256(secret));

        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(secParams.getSecret()).thenReturn(secret);
        when(response.getWriter()).thenReturn(writer);

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(response).setContentType("application/json");
        verify(writer).write(anyString());
        verify(filterChain, never()).doFilter(request, response);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("las autoridades salen del claim roles del token")
    void rolesDelToken() throws Exception {
        String secret = "test-secret-key";
        String token = JWT.create()
                .withSubject("jefe@biblioteca.ah")
                .withClaim("userId", 3L)
                .withArrayClaim("roles", new String[]{"ADMIN", "USER"})
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .sign(Algorithm.HMAC256(secret));

        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(secParams.getSecret()).thenReturn(secret);

        filter.doFilterInternal(request, response, filterChain);

        assertEquals(2, SecurityContextHolder.getContext().getAuthentication()
                .getAuthorities().size());
        assertTrue(SecurityContextHolder.getContext().getAuthentication().getAuthorities()
                .stream().anyMatch(a -> "ADMIN".equals(a.getAuthority())));
    }

    @Test
    @DisplayName("un token de antes de la ola 4 no trae roles y entra sin permisos, no se rechaza")
    void tokenAntiguoSinClaimDeRoles() throws Exception {
        /* Al desplegar, las sesiones abiertas llevan tokens sin el claim. Si
           eso fuera un rechazo, todo el mundo se quedaria fuera de golpe; si
           fuera un rol por defecto, se regalarian permisos que el token no
           dice. Se entra autenticado y sin autoridades. */
        String secret = "test-secret-key";
        String token = JWT.create()
                .withSubject("viejo@biblioteca.ah")
                .withClaim("userId", 4L)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .sign(Algorithm.HMAC256(secret));

        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(secParams.getSecret()).thenReturn(secret);

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertTrue(SecurityContextHolder.getContext().getAuthentication()
                .getAuthorities().isEmpty());
    }

    @Test
    @DisplayName("el id del usuario viaja en los detalles de la autenticacion")
    void elIdViajaEnLosDetalles() throws Exception {
        String secret = "test-secret-key";
        String token = JWT.create()
                .withSubject("test@biblioteca.ah")
                .withClaim("userId", 77L)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .sign(Algorithm.HMAC256(secret));

        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(secParams.getSecret()).thenReturn(secret);

        filter.doFilterInternal(request, response, filterChain);

        assertEquals(77L, SecurityContextHolder.getContext().getAuthentication().getDetails());
    }
}
