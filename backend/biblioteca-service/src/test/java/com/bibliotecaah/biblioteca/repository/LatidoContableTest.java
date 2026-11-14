package com.bibliotecaah.biblioteca.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("V-NUEVO-4: lo que cuenta un latido no pasa del tiempo real desde el ultimo fin del usuario + 10 s")
class LatidoContableTest {

    private final Instant ahora = Instant.parse("2026-11-14T12:00:00Z");

    @Test
    @DisplayName("sin sesiones previas cuenta lo pedido; tras un minuto, hasta 70 s; al instante, 10 s")
    void tope() {
        assertThat(SesionRepositoryImpl.contable(120, null, ahora)).isEqualTo(120);
        assertThat(SesionRepositoryImpl.contable(60, ahora.minusSeconds(60), ahora)).isEqualTo(60);
        assertThat(SesionRepositoryImpl.contable(120, ahora.minusSeconds(60), ahora)).isEqualTo(70);
        assertThat(SesionRepositoryImpl.contable(120, ahora.minusMillis(100), ahora)).isEqualTo(11);
        assertThat(SesionRepositoryImpl.contable(120, ahora, ahora)).isEqualTo(10);
        assertThat(SesionRepositoryImpl.contable(0, ahora.minusSeconds(3600), ahora)).isZero();
    }

    @Test
    @DisplayName("con el fin del usuario ya por delante del reloj (margen gastado) no cuenta nada")
    void margenGastado() {
        assertThat(SesionRepositoryImpl.contable(120, ahora.plusSeconds(4), ahora)).isEqualTo(6);
        assertThat(SesionRepositoryImpl.contable(120, ahora.plusSeconds(10), ahora)).isZero();
        assertThat(SesionRepositoryImpl.contable(120, ahora.plusSeconds(11), ahora)).isZero();
    }
}
