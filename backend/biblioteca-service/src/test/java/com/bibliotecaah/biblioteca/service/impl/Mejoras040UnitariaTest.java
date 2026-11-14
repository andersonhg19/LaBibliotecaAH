package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.CapituloDTO;
import com.bibliotecaah.biblioteca.dto.output.EstadoCasaDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("Mejoras 0.4.0: piezas sueltas (rachas, lampara de la casa, lector de estructura)")
class Mejoras040UnitariaTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Nested
    @DisplayName("Rachas (C4)")
    class Rachas {

        private final LocalDate hoy = LocalDate.of(2026, 11, 14);

        @Test
        @DisplayName("la racha actual cuenta hasta hoy, o hasta ayer si hoy aun no se ha leido")
        void actual() {
            assertThat(SesionServiceImpl.rachaActual(List.of(hoy.minusDays(2), hoy.minusDays(1), hoy), hoy)).isEqualTo(3);
            assertThat(SesionServiceImpl.rachaActual(List.of(hoy.minusDays(2), hoy.minusDays(1)), hoy)).isEqualTo(2);
            assertThat(SesionServiceImpl.rachaActual(List.of(hoy.minusDays(3), hoy.minusDays(2)), hoy)).isZero();
            assertThat(SesionServiceImpl.rachaActual(List.of(), hoy)).isZero();
        }

        @Test
        @DisplayName("la racha maxima es la serie de dias seguidos mas larga")
        void maxima() {
            assertThat(SesionServiceImpl.rachaMaxima(List.of())).isZero();
            assertThat(SesionServiceImpl.rachaMaxima(List.of(hoy))).isEqualTo(1);
            assertThat(SesionServiceImpl.rachaMaxima(List.of(hoy.minusDays(9), hoy.minusDays(8), hoy.minusDays(7),
                    hoy.minusDays(3), hoy.minusDays(1), hoy))).isEqualTo(3);
            assertThat(SesionServiceImpl.minutos(89)).isEqualTo(1);
            assertThat(SesionServiceImpl.minutos(90)).isEqualTo(2);
        }

        @Test
        @DisplayName("el constructor de Spring usa la zona de la casa")
        void zona() {
            assertThat(ZoneId.of("America/Bogota").getRules().getOffset(Instant.parse("2026-11-14T00:00:00Z")))
                    .isEqualTo(ZoneOffset.ofHours(-5));
            new SesionServiceImpl(null, null, "America/Bogota");
        }
    }

    @Nested
    @DisplayName("Lector de estructura (C1)")
    class Lector {

        @TempDir
        Path datos;

        private LectorDeEstructura lector;
        private final UUID archivo = UUID.randomUUID();

        @BeforeEach
        void preparar() {
            lector = new LectorDeEstructura(new AlmacenDeArchivos(datos.toString()), JSON);
        }

        private void escribir(String contenido) throws Exception {
            Path ruta = datos.resolve("normalizados/" + archivo + "/estructura.json");
            Files.createDirectories(ruta.getParent());
            Files.writeString(ruta, contenido);
        }

        @Test
        @DisplayName("version: 'version' (v2), si no 'versionFormato', si no 1; sin fichero o ilegible, SIN_ESTRUCTURA")
        void version() throws Exception {
            assertThat(lector.version(archivo)).isEqualTo(LectorDeEstructura.SIN_ESTRUCTURA);
            assertThat(lector.version(null)).isEqualTo(LectorDeEstructura.SIN_ESTRUCTURA);
            escribir("{\"versionFormato\":1,\"capitulos\":[]}");
            assertThat(lector.version(archivo)).isEqualTo(1);
            escribir("{\"version\":2,\"versionFormato\":1,\"capitulos\":[]}");
            assertThat(lector.version(archivo)).isEqualTo(2);
            escribir("{\"capitulos\":[]}");
            assertThat(lector.version(archivo)).isEqualTo(1);
            escribir("[1,2]");
            assertThat(lector.version(archivo)).isEqualTo(LectorDeEstructura.SIN_ESTRUCTURA);
            escribir("{roto");
            assertThat(lector.version(archivo)).isEqualTo(LectorDeEstructura.SIN_ESTRUCTURA);
            assertThat(lector.capitulos(archivo)).isEmpty();
        }

        @Test
        @DisplayName("capitulo v2: valores fuera de lista se ignoran; enVoz explicito manda sobre la region")
        void capitulo() throws Exception {
            JsonNode c = JSON.readTree("{\"titulo\":\"Notas\",\"palabras\":151,\"tipo\":\"notas\",\"region\":\"despues\","
                    + "\"enVoz\":true,\"palabrasVoz\":-5,\"numero\":3}");
            CapituloDTO dto = LectorDeEstructura.capitulo(c, 7);
            assertThat(dto.getIndice()).isEqualTo(7);
            assertThat(dto.getMinutos()).isEqualTo(2);
            assertThat(dto.getTipo()).isEqualTo("notas");
            assertThat(dto.getRegion()).isEqualTo("despues");
            assertThat(dto.getNumero()).isEqualTo(3);
            assertThat(dto.isEnVoz()).isTrue();
            assertThat(dto.getMinutosVoz()).isZero();
            CapituloDTO antes = LectorDeEstructura.capitulo(JSON.readTree("{\"region\":\" antes \",\"tipo\":\"\"}"), 0);
            assertThat(antes.getRegion()).isEqualTo("antes");
            assertThat(antes.getTipo()).isNull();
            assertThat(antes.isEnVozPorDefecto()).isFalse();
            assertThat(new CapituloDTO(1, "x", 2).isEnVoz()).isTrue();
        }

        @Test
        @DisplayName("sin el disco de datos, nada (y sin error)")
        void sinDisco() throws Exception {
            LectorDeEstructura sinDisco = new LectorDeEstructura(
                    new AlmacenDeArchivos(datos.resolve("no-existe").toString()), JSON);
            assertThat(sinDisco.capitulos(archivo)).isEmpty();
            assertThat(sinDisco.version(archivo)).isEqualTo(LectorDeEstructura.SIN_ESTRUCTURA);
        }
    }

    @Nested
    @DisplayName("Estado de la casa (C6)")
    class Casa {

        /** Reloj que avanza solo cuando se le dice (y que la sonda puede adelantar). */
        private final class Reloj extends Clock {
            Instant ahora = Instant.parse("2026-11-14T12:00:00Z");
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId z) { return this; }
            @Override public Instant instant() { return ahora; }
        }

        private final Reloj reloj = new Reloj();
        private final AlmacenDeArchivos almacen = mock(AlmacenDeArchivos.class);
        private final TrabajoRepository trabajos = mock(TrabajoRepository.class);
        private final Mensajes mensajes = mock(Mensajes.class);
        private final AtomicInteger consultasAlTaller = new AtomicInteger();
        private JsonNode saludTaller;
        private RuntimeException fallaTaller;
        private RuntimeException fallaTraductor;
        private Duration tardaTaller = Duration.ZERO;

        @BeforeEach
        void preparar() throws Exception {
            when(almacen.disponible()).thenReturn(true);
            when(trabajos.colaDeVoz()).thenReturn(7);
            when(mensajes.texto(any(Message.Msj.class))).thenAnswer(i -> "msg:" + i.getArgument(0));
            saludTaller = JSON.readTree("{\"estado\":\"ok\",\"trabajadores\":[{\"nombre\":\"voz\",\"vivo\":true}]}");
        }

        private EstadoDeLaCasa casa() {
            EstadoDeLaCasa.Sonda taller = () -> {
                consultasAlTaller.incrementAndGet();
                reloj.ahora = reloj.ahora.plus(tardaTaller);
                if (fallaTaller != null) throw fallaTaller;
                return saludTaller;
            };
            EstadoDeLaCasa.Sonda traductor = () -> {
                if (fallaTraductor != null) throw fallaTraductor;
                return null;
            };
            return new EstadoDeLaCasa(taller, traductor, almacen, trabajos, mensajes, reloj);
        }

        @Test
        @DisplayName("todo bien: OK, OK, OK, la cola y sin mensaje; la respuesta se guarda 15 s")
        void todoBien() {
            EstadoDeLaCasa casa = casa();
            EstadoCasaDTO e = casa.estado();
            assertThat(e.getTaller()).isEqualTo("OK");
            assertThat(e.getTraductor()).isEqualTo("OK");
            assertThat(e.getDisco()).isEqualTo("OK");
            assertThat(e.getColaVoz()).isEqualTo(7);
            assertThat(e.getMensaje()).isNull();
            reloj.ahora = reloj.ahora.plusSeconds(14);
            assertThat(casa.estado()).isSameAs(e);
            assertThat(consultasAlTaller.get()).isEqualTo(1);
            reloj.ahora = reloj.ahora.plusSeconds(1);
            casa.estado();
            assertThat(consultasAlTaller.get()).isEqualTo(2);
        }

        @Test
        @DisplayName("el taller no responde: CAIDO con su mensaje")
        void tallerCaido() {
            fallaTaller = new IllegalStateException("conexion rehusada");
            EstadoCasaDTO e = casa().estado();
            assertThat(e.getTaller()).isEqualTo("CAIDO");
            assertThat(e.getMensaje()).isEqualTo("msg:casaTallerCaido");
        }

        @Test
        @DisplayName("LENTO si tarda mas de 1,5 s, si un hilo murio o si un capitulo pedido espera mas de 2 min")
        void tallerLento() throws Exception {
            tardaTaller = Duration.ofMillis(1600);
            assertThat(casa().estado().getTaller()).isEqualTo("LENTO");
            tardaTaller = Duration.ZERO;
            saludTaller = JSON.readTree("{\"trabajadores\":[{\"vivo\":true},{\"vivo\":false}]}");
            EstadoCasaDTO e = casa().estado();
            assertThat(e.getTaller()).isEqualTo("LENTO");
            assertThat(e.getMensaje()).isEqualTo("msg:casaTallerLento");
            saludTaller = null;
            when(trabajos.vozUrgenteAtascada(anyInt())).thenReturn(true);
            assertThat(casa().estado().getTaller()).isEqualTo("LENTO");
        }

        @Test
        @DisplayName("traductor caido y disco desconectado: el disco manda en el mensaje")
        void traductorYDisco() {
            fallaTraductor = new IllegalStateException("503");
            EstadoCasaDTO e = casa().estado();
            assertThat(e.getTraductor()).isEqualTo("CAIDO");
            assertThat(e.getMensaje()).isEqualTo("msg:casaTraductorCaido");
            when(almacen.disponible()).thenReturn(false);
            EstadoCasaDTO sinDisco = casa().estado();
            assertThat(sinDisco.getDisco()).isEqualTo("DESCONECTADO");
            assertThat(sinDisco.getMensaje()).isEqualTo("msg:casaDiscoDesconectado");
        }

        @Test
        @DisplayName("la sonda real contra una URL que no responde lanza (y el estado queda CAIDO)")
        void sondaReal() {
            EstadoDeLaCasa casa = new EstadoDeLaCasa("http://127.0.0.1:9", "http://127.0.0.1:9", almacen, trabajos,
                    mensajes);
            EstadoCasaDTO e = casa.estado();
            assertThat(e.getTaller()).isEqualTo("CAIDO");
            assertThat(e.getTraductor()).isEqualTo("CAIDO");
        }
    }
}
