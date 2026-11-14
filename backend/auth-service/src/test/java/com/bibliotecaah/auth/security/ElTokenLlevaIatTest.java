package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.bibliotecaah.auth.entity.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Auditoria BK-08: el token lleva la hora en que se emitio (iat), ademas de exp. */
@DisplayName("El token lleva iat")
class ElTokenLlevaIatTest {

    @Test
    @DisplayName("iat = hora de emision y exp = iat + EXP_TIME")
    void conIat() {
        SecParams params = Mockito.mock(SecParams.class);
        Mockito.when(params.getSecret()).thenReturn("secreto-de-pruebas-de-iat");
        Mockito.when(params.getExpiredTime()).thenReturn(86_400_000L);
        Instant ahora = Instant.parse("2026-11-14T10:00:00Z");
        EmisorDeTokens emisor = new EmisorDeTokens(params, Clock.fixed(ahora, ZoneOffset.UTC));
        User u = new User();
        u.setId(7L);
        u.setEmail("ana@biblioteca.ah");
        u.setName("Ana");

        DecodedJWT token = JWT.decode(emisor.emitir(u, List.of("USER")));

        assertThat(token.getIssuedAtAsInstant()).isEqualTo(ahora);
        assertThat(token.getExpiresAtAsInstant()).isEqualTo(ahora.plusSeconds(86_400));
    }
}
