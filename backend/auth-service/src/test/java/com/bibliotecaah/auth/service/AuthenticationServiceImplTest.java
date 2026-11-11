package com.bibliotecaah.auth.service;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.security.DemasiadosIntentosException;
import com.bibliotecaah.auth.security.IdentidadDeLogin;
import com.bibliotecaah.auth.security.LimiteDeIntentosDeLogin;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.impl.AuthenticationServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Inicio de sesion con correo o alias")
class AuthenticationServiceImplTest {

    @Mock private AuthenticationManager authenticationManager;
    @Mock private UserRepository userRepository;
    @Mock private SecParams secParams;
    @Mock private ApplicationEventPublisher eventos;
    @Mock private LimiteDeIntentosDeLogin limiteDeIntentos;
    @Mock private IdentidadDeLogin identidades;

    private AuthenticationServiceImpl authenticationService;

    private User ana;

    @BeforeEach
    void setUp() {
        authenticationService = new AuthenticationServiceImpl(authenticationManager, userRepository,
                new com.bibliotecaah.auth.security.EmisorDeTokens(secParams), eventos, limiteDeIntentos, identidades);
        ana = User.builder()
                .id(1L).name("Ana").email("ana@biblioteca.ah").alias("ana")
                .password("cifrada").active(true)
                .roles(new HashSet<>(Set.of(
                        Role.builder().id(2L).name("USER").active(true).build(),
                        Role.builder().id(3L).name("VIEJO").active(false).build())))
                .build();
    }

    private static AuthenticationRequest pide(String usuario, String email, String clave) {
        return new AuthenticationRequest(usuario, email, clave);
    }

    private void anaExisteCon(String identificador) {
        when(identidades.buscarActiva(identificador)).thenReturn(Optional.of(ana));
    }

    private void firmaConSecreto() {
        when(secParams.getSecret()).thenReturn("test-secret-key");
        when(secParams.getExpiredTime()).thenReturn(3_600_000L);
    }

    @Nested
    @DisplayName("cuando la clave es correcta")
    class ClaveCorrecta {

        @Test
        @DisplayName("por alias: responde con correo, alias, userId y solo los roles activos")
        void porAlias() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            AuthenticationResponse respuesta = authenticationService.authenticate(pide("ana", null, "Clave123"));

            assertEquals("ana@biblioteca.ah", respuesta.getEmail());
            assertEquals("ana", respuesta.getAlias());
            assertEquals("Ana", respuesta.getName());
            assertEquals(1L, respuesta.getUserId());
            assertEquals(List.of("USER"), respuesta.getRoles());
        }

        @Test
        @DisplayName("QA UX-14: la auditoria del login dice «Entró con los roles…», con tilde")
        void auditoriaConTilde() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            authenticationService.authenticate(pide("ana", null, "Clave123"));

            ArgumentCaptor<com.bibliotecaah.auth.service.CambioAuditable> cambio =
                    ArgumentCaptor.forClass(com.bibliotecaah.auth.service.CambioAuditable.class);
            verify(eventos).publishEvent(cambio.capture());
            assertEquals("Entró con los roles [USER]", cambio.getValue().details());
        }

        @Test
        @DisplayName("Spring comprueba la clave con lo que se escribio, no con el correo")
        void autenticaConLoEscrito() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            authenticationService.authenticate(pide("ana", null, "Clave123"));

            ArgumentCaptor<UsernamePasswordAuthenticationToken> token =
                    ArgumentCaptor.forClass(UsernamePasswordAuthenticationToken.class);
            verify(authenticationManager).authenticate(token.capture());
            assertEquals("ana", token.getValue().getPrincipal());
            assertEquals("Clave123", token.getValue().getCredentials());
        }

        @Test
        @DisplayName("el token NO cambia: sub = correo, userId, name y roles, aunque se entre por alias")
        void elTokenSigueIgual() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            AuthenticationResponse respuesta = authenticationService.authenticate(pide("ana", null, "Clave123"));

            DecodedJWT token = JWT.require(Algorithm.HMAC256("test-secret-key")).build()
                    .verify(respuesta.getToken());
            assertEquals("ana@biblioteca.ah", token.getSubject());
            assertEquals(1L, token.getClaim("userId").asLong());
            assertEquals("Ana", token.getClaim("name").asString());
            assertEquals(List.of("USER"), token.getClaim("roles").asList(String.class));
            assertTrue(token.getClaim("alias").isMissing());
            assertNotNull(token.getExpiresAt());
        }

        @Test
        @DisplayName("'email' sigue valiendo como sinonimo de 'usuario'")
        void emailComoSinonimo() {
            anaExisteCon("ana@biblioteca.ah");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            AuthenticationResponse respuesta =
                    authenticationService.authenticate(pide(null, "ana@biblioteca.ah", "Clave123"));

            assertEquals(1L, respuesta.getUserId());
        }

        @Test
        @DisplayName("un acierto limpia el contador de la CUENTA")
        void aciertoLimpiaLaCuenta() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            firmaConSecreto();

            authenticationService.authenticate(pide("ana", null, "Clave123"));

            verify(limiteDeIntentos).registrarExito("cuenta:1", null);
            verify(limiteDeIntentos, never()).registrarFallo(any(), any());
        }

        @Test
        @DisplayName("si la cuenta desaparece entre la clave y el token, credenciales incorrectas")
        void cuentaDesaparecida() {
            anaExisteCon("ana");
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.empty());

            assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(pide("ana", null, "Clave123")));
        }

        @Test
        @DisplayName("si la cuenta se desactivo entre la clave y el token, tampoco entra")
        void cuentaDesactivadaEnMedio() {
            anaExisteCon("ana");
            User desactivada = User.builder().id(1L).email("ana@biblioteca.ah").alias("ana").active(false).build();
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(desactivada));

            assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(pide("ana", null, "Clave123")));
        }
    }

    @Nested
    @DisplayName("cuando la clave es incorrecta o la cuenta no existe")
    class ClaveIncorrecta {

        @Test
        @DisplayName("clave mala: el fallo se anota contra la cuenta, no contra lo escrito")
        void claveMalaCuentaPorCuenta() {
            anaExisteCon("ana");
            when(authenticationManager.authenticate(any())).thenThrow(new BadCredentialsException("x"));

            assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(pide("ana", null, "mala")));

            verify(limiteDeIntentos).registrarFallo("cuenta:1", null);
            verify(limiteDeIntentos, never()).registrarExito(any(), any());
        }

        @Test
        @DisplayName("usuario inexistente: mismo BadCredentialsException y el fallo cuenta por lo escrito normalizado")
        void inexistente() {
            when(identidades.buscarActiva(" Nadie ")).thenReturn(Optional.empty());
            when(authenticationManager.authenticate(any())).thenThrow(new BadCredentialsException("x"));

            BadCredentialsException error = assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(pide(" Nadie ", null, "mala")));

            assertEquals("Invalid credentials", error.getMessage());
            verify(limiteDeIntentos).registrarFallo("identificador:nadie", null);
        }

        @Test
        @DisplayName("clave mala sobre cuenta existente da el MISMO mensaje que la inexistente")
        void mismoMensaje() {
            anaExisteCon("ana");
            when(authenticationManager.authenticate(any())).thenThrow(new BadCredentialsException("x"));

            BadCredentialsException error = assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(pide("ana", null, "mala")));

            assertEquals("Invalid credentials", error.getMessage());
        }
    }

    @Nested
    @DisplayName("limite de intentos")
    class Limite {

        @Test
        @DisplayName("con la cuenta bloqueada no se mira ni la contrasena (QA M7)")
        void bloqueada() {
            anaExisteCon("ana@biblioteca.ah");
            when(limiteDeIntentos.estaBloqueado("cuenta:1", null)).thenReturn(true);

            assertThrows(DemasiadosIntentosException.class,
                    () -> authenticationService.authenticate(pide("ana@biblioteca.ah", null, "Clave123")));
            verify(authenticationManager, never()).authenticate(any());
        }

        @Test
        @DisplayName("un identificador sin cuenta tambien se bloquea, por su texto normalizado")
        void inexistenteBloqueado() {
            when(identidades.buscarActiva("NADIE")).thenReturn(Optional.empty());
            when(limiteDeIntentos.estaBloqueado("identificador:nadie", null)).thenReturn(true);

            assertThrows(DemasiadosIntentosException.class,
                    () -> authenticationService.authenticate(pide("NADIE", null, "x")));
            verify(authenticationManager, never()).authenticate(any());
        }
    }
}
