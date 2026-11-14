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
    /** Retardos pedidos tras cada fallo (BK-01), sin dormir de verdad. */
    private final java.util.List<Duration> esperas = new java.util.ArrayList<>();

    @BeforeEach
    void preparar() {
        reloj = new RelojManual();
        esperas.clear();
        limite = new LimiteDeIntentosDeLogin(reloj, esperas::add);
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
    @org.junit.jupiter.api.Nested
    @DisplayName("QA SE-08: frenos por origen y global")
    class PorOrigen {

        @Test
        @DisplayName("fallar con la cuenta de otro desde mi dispositivo no la bloquea en el suyo")
        void otroOrigenNoBloquea() {
            for (int i = 0; i < 5; i++) limite.registrarFallo("cuenta:1", "100.64.0.9");

            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.9")).isTrue();
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.2")).isFalse();
            assertThat(limite.estaBloqueado("cuenta:1")).as("sin origen = 'desconocido', otro contador").isFalse();
        }

        @Test
        @DisplayName("un exito en un origen no limpia los fallos de otro")
        void exitoSoloEnSuOrigen() {
            for (int i = 0; i < 5; i++) limite.registrarFallo("cuenta:1", "100.64.0.9");
            limite.registrarExito("cuenta:1", "100.64.0.2");
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.9")).isTrue();
            limite.registrarExito("cuenta:1", "100.64.0.9");
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.9")).isFalse();
        }

        @Test
        @DisplayName("un barrido desde un origen (20 cuentas distintas) frena ese origen 10 minutos")
        void barridoDesdeUnOrigen() {
            for (int i = 0; i < 19; i++) limite.registrarFallo("identificador:u" + i, "100.64.0.9");
            assertThat(limite.estaBloqueado("identificador:nueva", "100.64.0.9")).isFalse();

            limite.registrarFallo("identificador:u19", "100.64.0.9");
            assertThat(limite.estaBloqueado("identificador:nueva", "100.64.0.9")).isTrue();
            assertThat(limite.estaBloqueado("identificador:nueva", "100.64.0.2")).isFalse();

            reloj.avanzar(Duration.ofMinutes(10));
            assertThat(limite.estaBloqueado("identificador:nueva", "100.64.0.9")).isFalse();
        }

        @Test
        @DisplayName("BK-01: 60 fallos en un minuto entre muchos origenes ya NO bloquean a los demas")
        void globalNoBloquea() {
            for (int i = 0; i < 60; i++) limite.registrarFallo("identificador:u" + i, "10.0.0." + (i % 30));
            assertThat(limite.estaBloqueado("cuenta:7", "100.64.0.99")).isFalse();
            assertThat(limite.estaBloqueado("cuenta:7")).isFalse();
        }

        @Test
        @DisplayName("G1: 60 intentos de una cuenta desde un origen no bloquean a otra cuenta ni al mismo origen con otra cuenta")
        void unaCuentaNoBloqueaALasDemas() {
            for (int i = 0; i < 60; i++) {
                /* Como el servicio: si esta bloqueada ni se mira la clave ni se anota el fallo. */
                if (!limite.estaBloqueado("cuenta:1", "100.64.0.9")) limite.registrarFallo("cuenta:1", "100.64.0.9");
            }
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.9")).isTrue();
            assertThat(limite.estaBloqueado("cuenta:2", "100.64.0.9")).isFalse();
            assertThat(limite.estaBloqueado("cuenta:2", "100.64.0.2")).isFalse();
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.2")).isFalse();
        }

        @Test
        @DisplayName("BK-01: el retardo crece con los fallos de ESE origen y no toca a los demas")
        void retardoProgresivo() {
            for (int i = 0; i < 9; i++) limite.registrarFallo("identificador:u" + i, "100.64.0.9");
            assertThat(esperas).containsExactly(Duration.ofMillis(250), Duration.ofMillis(500), Duration.ofSeconds(1),
                    Duration.ofSeconds(2), Duration.ofSeconds(4), Duration.ofSeconds(4));
            assertThat(limite.retardo("100.64.0.2")).isZero();
            assertThat(limite.retardo(null)).isZero();

            reloj.avanzar(Duration.ofMinutes(10));
            assertThat(limite.retardo("100.64.0.9")).isZero();
        }

        @Test
        @DisplayName("BK-01: con el contador global lleno cada fallo espera al menos 1 s; el login correcto no espera")
        void retardoGlobal() {
            for (int i = 0; i < 60; i++) limite.registrarFallo("identificador:u" + i, "10.0.0." + (i % 30));
            assertThat(limite.retardo("100.64.0.77")).isEqualTo(Duration.ofSeconds(1));
            limite.registrarExito("cuenta:7", "100.64.0.77");
            assertThat(esperas).as("2 fallos por origen no esperan; el que llena el global, 1 s")
                    .containsExactly(Duration.ofSeconds(1));
            assertThat(new LimiteDeIntentosDeLogin(false).retardo("x")).isZero();
            assertThat(new LimiteDeIntentosDeLogin(true).retardo("x")).isZero();
        }

        @Test
        @DisplayName("con mas de 10 000 origenes se barren los caducados y los frenos siguen funcionando")
        void barreCaducados() {
            for (int i = 0; i < 10_001; i++) limite.registrarFallo("identificador:u" + i, "10.1." + (i / 250) + "." + (i % 250));
            reloj.avanzar(Duration.ofMinutes(11));
            for (int i = 0; i < 5; i++) limite.registrarFallo("cuenta:1", "100.64.0.9");
            assertThat(limite.estaBloqueado("cuenta:1", "100.64.0.9")).isTrue();
            assertThat(limite.estaBloqueado("cuenta:2", "100.64.0.9")).isFalse();
        }

        @Test
        @DisplayName("una espera interrumpida no revienta el login y conserva la interrupcion")
        void esperaInterrumpida() {
            LimiteDeIntentosDeLogin conInterrupcion = new LimiteDeIntentosDeLogin(reloj, d -> {
                throw new InterruptedException();
            });
            for (int i = 0; i < 4; i++) conInterrupcion.registrarFallo("identificador:x" + i, "100.64.0.5");
            assertThat(Thread.interrupted()).isTrue();
        }

        @Test
        @DisplayName("el constructor real duerme de verdad (retardo corto)")
        void esperaReal() {
            LimiteDeIntentosDeLogin real = new LimiteDeIntentosDeLogin(reloj);
            long antes = System.nanoTime();
            for (int i = 0; i < 4; i++) real.registrarFallo("identificador:y" + i, "100.64.0.6");
            assertThat(Duration.ofNanos(System.nanoTime() - antes)).isGreaterThanOrEqualTo(Duration.ofMillis(240));
        }

        @Test
        @DisplayName("origenes con mayusculas o espacios cuentan como el mismo")
        void origenNormalizado() {
            for (int i = 0; i < 5; i++) limite.registrarFallo("cuenta:1", i % 2 == 0 ? " FD7A::1 " : "fd7a::1");
            assertThat(limite.estaBloqueado("cuenta:1", "fd7a::1")).isTrue();
        }
    }
}
