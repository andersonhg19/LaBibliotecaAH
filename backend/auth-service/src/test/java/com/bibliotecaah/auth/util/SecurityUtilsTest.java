package com.bibliotecaah.auth.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SecurityUtils era codigo muerto: existia, tenia prueba, y no lo llamaba
 * nadie. Su prueba antigua incluso fijaba como contrato que estallara con un
 * NullPointerException cuando no habia sesion — es decir, describia un
 * accidente en vez de una decision.
 *
 * Ahora es la unica fuente de identidad del servicio, y su contrato es
 * explicito: sin token devuelve null, y "sin dueno" nunca significa "de todos".
 *
 * Desde la ola 4 responde ademas a la segunda pregunta —que puede hacer quien
 * pide— y ahi la regla es la misma: la ausencia de dato NUNCA concede.
 */
class SecurityUtilsTest {

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    private void autenticar(String email, Long userId, String... roles) {
        Collection<SimpleGrantedAuthority> autoridades = Arrays.stream(roles)
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(email, null, autoridades);
        auth.setDetails(userId);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    @DisplayName("devuelve el correo del token")
    void devuelveCorreo() {
        autenticar("test@biblioteca.ah", 1L);
        assertEquals("test@biblioteca.ah", SecurityUtils.getAuthenticatedEmail());
    }

    @Test
    @DisplayName("devuelve el id de usuario que viaja en el token")
    void devuelveUserId() {
        autenticar("test@biblioteca.ah", 42L);
        assertEquals(42L, SecurityUtils.getAuthenticatedUserId());
    }

    @Test
    @DisplayName("sin sesion devuelve null, no revienta")
    void sinSesionDevuelveNull() {
        SecurityContextHolder.clearContext();
        assertNull(SecurityUtils.getAuthenticatedEmail());
        assertNull(SecurityUtils.getAuthenticatedUserId());
    }

    @Test
    @DisplayName("un token sin claim de id no suplanta a nadie")
    void tokenSinIdNoSuplanta() {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("x@y.z", null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);
        assertNull(SecurityUtils.getAuthenticatedUserId());
        assertFalse(SecurityUtils.esDelUsuario(1L));
    }

    @Test
    @DisplayName("esDelUsuario: solo si coincide, y un recurso sin dueno no es de nadie")
    void esDelUsuario() {
        autenticar("a@b.c", 7L);
        assertTrue(SecurityUtils.esDelUsuario(7L));
        assertFalse(SecurityUtils.esDelUsuario(8L));
        assertFalse(SecurityUtils.esDelUsuario(null));
    }

    @Nested
    @DisplayName("Roles: la segunda pregunta")
    class Roles {

        @Test
        @DisplayName("reconoce el rol que trae el token")
        void reconoceElRol() {
            autenticar("a@b.c", 7L, "USER", "ADMIN");
            assertTrue(SecurityUtils.tieneRol("ADMIN"));
            assertTrue(SecurityUtils.tieneRol("USER"));
            assertTrue(SecurityUtils.esAdmin());
        }

        @Test
        @DisplayName("un rol que no lleva es que no")
        void rolQueNoLleva() {
            autenticar("a@b.c", 7L, "USER");
            assertFalse(SecurityUtils.tieneRol("ADMIN"));
            assertFalse(SecurityUtils.esAdmin());
        }

        @Test
        @DisplayName("la comparacion es exacta: ni prefijo ROLE_ ni mayusculas de mas")
        void comparacionExacta() {
            /* Se usa hasAuthority y no hasRole justamente para que lo que se
               escribe sea lo que se compara. Si esto dejara de ser cierto, un
               "ROLE_ADMIN" en la base abriria puertas que dicen "ADMIN". */
            autenticar("a@b.c", 7L, "ROLE_ADMIN", "admin");
            assertFalse(SecurityUtils.tieneRol("ADMIN"));
            assertFalse(SecurityUtils.esAdmin());
        }

        @Test
        @DisplayName("sin sesion no hay rol, y eso se responde que no")
        void sinSesionNoHayRol() {
            SecurityContextHolder.clearContext();
            assertFalse(SecurityUtils.tieneRol("ADMIN"));
            assertFalse(SecurityUtils.esAdmin());
        }

        @Test
        @DisplayName("preguntar por un rol nulo tampoco concede")
        void rolNulo() {
            autenticar("a@b.c", 7L, "ADMIN");
            assertFalse(SecurityUtils.tieneRol(null));
        }

        @Test
        @DisplayName("un token sin ningun rol es alguien autenticado que no puede administrar")
        void tokenSinRoles() {
            autenticar("a@b.c", 7L);
            assertFalse(SecurityUtils.esAdmin());
            assertTrue(SecurityUtils.esDelUsuario(7L));
        }

        @Test
        @DisplayName("puedeAcceder: lo tuyo, o ser administrador")
        void puedeAcceder() {
            autenticar("a@b.c", 7L, "USER");
            assertTrue(SecurityUtils.puedeAcceder(7L));
            assertFalse(SecurityUtils.puedeAcceder(8L));

            SecurityContextHolder.clearContext();
            autenticar("jefe@b.c", 1L, "ADMIN");
            assertTrue(SecurityUtils.puedeAcceder(7L));
            assertTrue(SecurityUtils.puedeAcceder(1L));
        }

        @Test
        @DisplayName("y sin sesion no accede a nada")
        void sinSesionNoAccede() {
            SecurityContextHolder.clearContext();
            assertFalse(SecurityUtils.puedeAcceder(7L));
        }

        @Test
        @DisplayName("las constantes de rol son las que usa el SecurityConfig")
        void constantes() {
            assertEquals("ADMIN", SecurityUtils.ROL_ADMIN);
            assertEquals("USER", SecurityUtils.ROL_USER);
            assertEquals(List.of("ADMIN", "USER"),
                    List.of(SecurityUtils.ROL_ADMIN, SecurityUtils.ROL_USER));
        }
    }
}
