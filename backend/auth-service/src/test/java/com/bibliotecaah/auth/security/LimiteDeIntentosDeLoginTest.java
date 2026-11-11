package com.bibliotecaah.auth.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/** QA M7: 30 contrasenas en 3 segundos sin freno. */
@DisplayName("Limite de intentos de login")
class LimiteDeIntentosDeLoginTest {

    /** Reloj que solo avanza cuando la prueba lo dice. */
    private static final class RelojManual extends Clock {
        private Instant ahora = Instant.parse("2026-11-10T12:00:00Z");
        void avanzar(Duration d) { ahora = ahora.plus(d); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return ahora; }
    }

    private RelojManual reloj;
    private LimiteDeIntentosDeLogin limite;

    @BeforeEach
    void preparar() {
        reloj = new RelojManual();
        limite = new LimiteDeIntentosDeLogin(reloj);
    }

    private void fallar(String correo, int veces) {
        for (int i = 0; i < veces; i++) limite.registrarFallo(correo);
    }

    @Test
    @DisplayName("cuatro fallos no bloquean; el quinto si")
    void bloqueaAlQuinto() {
        fallar("ana@biblioteca.ah", 4);
        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isFalse();

        limite.registrarFallo("ana@biblioteca.ah");
        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isTrue();
    }

    @Test
    @DisplayName("pasados 5 minutos del primer fallo se desbloquea")
    void seDesbloqueaConElTiempo() {
        fallar("ana@biblioteca.ah", 5);

        reloj.avanzar(Duration.ofMinutes(4).plusSeconds(59));
        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isTrue();

        reloj.avanzar(Duration.ofSeconds(1));
        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isFalse();
    }

    @Test
    @DisplayName("fallos espaciados mas de la ventana no se acumulan")
    void ventanaDeslizante() {
        for (int i = 0; i < 10; i++) {
            limite.registrarFallo("ana@biblioteca.ah");
            reloj.avanzar(Duration.ofMinutes(2));
        }
        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isFalse();
    }

    @Test
    @DisplayName("un login correcto pone el contador a cero")
    void exitoReinicia() {
        fallar("ana@biblioteca.ah", 4);
        limite.registrarExito("ana@biblioteca.ah");
        fallar("ana@biblioteca.ah", 4);

        assertThat(limite.estaBloqueado("ana@biblioteca.ah")).isFalse();
    }

    @Test
    @DisplayName("mayusculas y espacios cuentan como el mismo correo")
    void noSeSaltaCambiandoMayusculas() {
        fallar("Ana@Biblioteca.AH", 3);
        fallar("  ana@biblioteca.ah ", 2);

        assertThat(limite.estaBloqueado("ANA@BIBLIOTECA.AH")).isTrue();
    }

    @Test
    @DisplayName("bloquear a uno no bloquea a otro")
    void porCorreo() {
        fallar("ana@biblioteca.ah", 5);

        assertThat(limite.estaBloqueado("bruno@biblioteca.ah")).isFalse();
    }

    @Test
    @DisplayName("un correo nulo o vacio no revienta ni bloquea")
    void nulos() {
        limite.registrarFallo(null);
        limite.registrarFallo(" ");
        assertThat(limite.estaBloqueado(null)).isFalse();
        assertThat(limite.estaBloqueado("")).isFalse();
    }
}
