package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.impl.AuthenticationServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import org.junit.jupiter.api.Nested;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthenticationServiceImplTest {

    @Mock
    private AuthenticationManager authenticationManager;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SecParams secParams;

    @Mock
    private org.springframework.context.ApplicationEventPublisher eventos;

    @Mock
    private com.bibliotecaah.auth.security.LimiteDeIntentosDeLogin limiteDeIntentos;

    @InjectMocks
    private AuthenticationServiceImpl authenticationService;

    private User testUser;
    private AuthenticationRequest request;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(1L)
                .name("Test User")
                .email("test@biblioteca.ah")
                .password("encoded-password")
                
                .active(true)
                .build();

        request = new AuthenticationRequest();
        request.setEmail("test@biblioteca.ah");
        request.setPassword("Password123!");
    }

    @Test
    @DisplayName("Should authenticate successfully and return JWT")
    void shouldAuthenticateSuccessfully() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(new UsernamePasswordAuthenticationToken("test@biblioteca.ah", null));
        when(userRepository.findByEmailAndActiveTrueWithRoles("test@biblioteca.ah")).thenReturn(Optional.of(testUser));
        when(secParams.getSecret()).thenReturn("test-secret-key");
        when(secParams.getExpiredTime()).thenReturn(3600000L);

        AuthenticationResponse response = authenticationService.authenticate(request);

        assertNotNull(response);
        assertNotNull(response.getToken());
        assertEquals("test@biblioteca.ah", response.getEmail());
        assertEquals("Test User", response.getName());
        assertEquals(1L, response.getUserId());
    }

    @Test
    @DisplayName("Should throw BadCredentialsException for invalid password")
    void shouldThrowBadCredentialsForInvalidPassword() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        assertThrows(BadCredentialsException.class,
                () -> authenticationService.authenticate(request));
    }

    @Test
    @DisplayName("Should throw BadCredentialsException when user not found after auth")
    void shouldThrowWhenUserNotFoundAfterAuth() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(new UsernamePasswordAuthenticationToken("test@biblioteca.ah", null));
        when(userRepository.findByEmailAndActiveTrueWithRoles("test@biblioteca.ah")).thenReturn(Optional.empty());

        assertThrows(BadCredentialsException.class,
                () -> authenticationService.authenticate(request));
    }

    @Test
    @DisplayName("Should include userId and name in JWT claims")
    void shouldIncludeClaimsInJWT() {
        when(authenticationManager.authenticate(any())).thenReturn(null);
        when(userRepository.findByEmailAndActiveTrueWithRoles("test@biblioteca.ah")).thenReturn(Optional.of(testUser));
        when(secParams.getSecret()).thenReturn("test-secret-key");
        when(secParams.getExpiredTime()).thenReturn(3600000L);

        AuthenticationResponse response = authenticationService.authenticate(request);

        assertNotNull(response.getToken());

        /* Contar que el token tiene tres trozos lo cumple CUALQUIER JWT, lleve
           los claims o no: el test prometia comprobar userId y name y no
           comprobaba ninguno. Y ahora importa de verdad, porque el filtro de
           los tres servicios saca de aqui el userId: si ese claim faltara, la
           identidad se quedaria sin resolver en toda la plataforma. */
        var decodificado = com.auth0.jwt.JWT.require(
                        com.auth0.jwt.algorithms.Algorithm.HMAC256("test-secret-key"))
                .build().verify(response.getToken());
        assertEquals("test@biblioteca.ah", decodificado.getSubject());
        assertEquals(testUser.getId(), decodificado.getClaim("userId").asLong());
        assertEquals(testUser.getName(), decodificado.getClaim("name").asString());
    }

    @Nested
    @DisplayName("JWT Token Claims")
    class JwtClaimsTests {

        @Test
        @DisplayName("Should generate JWT with correct subject (email) and claims (userId, name)")
        void shouldGenerateJwtWithCorrectClaims() {
            when(authenticationManager.authenticate(any())).thenReturn(null);
            when(userRepository.findByEmailAndActiveTrueWithRoles("test@biblioteca.ah")).thenReturn(Optional.of(testUser));
            when(secParams.getSecret()).thenReturn("test-secret-key");
            when(secParams.getExpiredTime()).thenReturn(3600000L);

            AuthenticationResponse response = authenticationService.authenticate(request);

            DecodedJWT decoded = JWT.decode(response.getToken());
            assertEquals("test@biblioteca.ah", decoded.getSubject());
            assertEquals(1L, decoded.getClaim("userId").asLong());
            assertEquals("Test User", decoded.getClaim("name").asString());
            assertNotNull(decoded.getExpiresAt());
        }
    }

    @Nested
    @DisplayName("Edge Cases")
    class EdgeCaseTests {

        @Test
        @DisplayName("Should throw BadCredentialsException when email is null in request")
        void shouldThrowWhenEmailIsNull() {
            AuthenticationRequest nullEmailRequest = new AuthenticationRequest();
            nullEmailRequest.setEmail(null);
            nullEmailRequest.setPassword("Password123!");

            when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                    .thenThrow(new BadCredentialsException("Bad credentials"));

            assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(nullEmailRequest));
        }

        @Test
        @DisplayName("Should throw BadCredentialsException when password is empty")
        void shouldThrowWhenPasswordIsEmpty() {
            AuthenticationRequest emptyPassRequest = new AuthenticationRequest();
            emptyPassRequest.setEmail("test@biblioteca.ah");
            emptyPassRequest.setPassword("");

            when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                    .thenThrow(new BadCredentialsException("Bad credentials"));

            assertThrows(BadCredentialsException.class,
                    () -> authenticationService.authenticate(emptyPassRequest));
        }
    }

    @Test
    @DisplayName("con el correo bloqueado no se mira ni la contrasena (QA M7)")
    void correoBloqueado() {
        when(limiteDeIntentos.estaBloqueado("test@biblioteca.ah")).thenReturn(true);

        assertThrows(com.bibliotecaah.auth.security.DemasiadosIntentosException.class,
                () -> authenticationService.authenticate(request));
        verify(authenticationManager, never()).authenticate(any());
    }

    @Test
    @DisplayName("un fallo se anota en el limite; un acierto lo limpia")
    void falloYAciertoSeAnotan() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new org.springframework.security.authentication.BadCredentialsException("x"));

        assertThrows(org.springframework.security.authentication.BadCredentialsException.class,
                () -> authenticationService.authenticate(request));
        verify(limiteDeIntentos).registrarFallo("test@biblioteca.ah");
        verify(limiteDeIntentos, never()).registrarExito(any());
    }
}
