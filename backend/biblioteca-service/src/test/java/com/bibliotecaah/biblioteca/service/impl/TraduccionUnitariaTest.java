package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.client.TraductorClient;
import com.bibliotecaah.biblioteca.dto.input.TraducirCapituloDTO;
import com.bibliotecaah.biblioteca.dto.output.CapituloTraducidoDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.TraduccionRepository;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.LimitadorPorUsuario;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@DisplayName("Traduccion: piezas sueltas sin base de datos")
class TraduccionUnitariaTest {

    private final Instant[] ahora = {Instant.parse("2026-11-11T12:00:00Z")};
    private final Clock reloj = new Clock() {
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId z) { return this; }
        @Override public Instant instant() { return ahora[0]; }
    };

    private static Mensajes mensajes() {
        ResourceBundleMessageSource fuente = new ResourceBundleMessageSource();
        fuente.setBasename("messages");
        fuente.setDefaultEncoding("UTF-8");
        fuente.setFallbackToSystemLocale(false);
        return new Mensajes(fuente);
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("LimitadorPorUsuario")
    class Limitador {

        @Test
        @DisplayName("deja pasar hasta la capacidad dentro de la ventana y la libera cuando pasa")
        void ventana() {
            LimitadorPorUsuario l = new LimitadorPorUsuario(10, Duration.ofMinutes(1), reloj);
            assertThat(l.capacidad()).isEqualTo(10);
            assertThat(l.consumir(1L, 6)).isTrue();
            assertThat(l.consumir(1L, 5)).as("6 + 5 > 10").isFalse();
            assertThat(l.consumir(1L, 4)).as("lo rechazado no se apunto").isTrue();
            assertThat(l.consumir(2L, 10)).as("cada usuario con su cupo").isTrue();
            ahora[0] = ahora[0].plusSeconds(60);
            assertThat(l.consumir(1L, 10)).as("a los 60 s la ventana se vacio").isTrue();
            assertThat(l.consumir(1L, 1)).isFalse();
            assertThat(new LimitadorPorUsuario(3, Duration.ofMinutes(1), reloj).consumir(1L, 4)).isFalse();
        }
    }

    @Nested
    @DisplayName("TraductorClient")
    class Cliente {

        private final RestClient.Builder constructor = RestClient.builder().baseUrl("http://traductor:5000");
        private final MockRestServiceServer servidor = MockRestServiceServer.bindTo(constructor).build();
        private final TraductorClient cliente = new TraductorClient(constructor.build());

        private void responde(String json) {
            servidor.expect(requestTo("http://traductor:5000/translate")).andExpect(method(HttpMethod.POST))
                    .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
        }

        @Test
        @DisplayName("lote con detectedLanguage como objeto, como lista, vacio o ausente")
        void detectado() {
            responde("{\"translatedText\":[\"Hola\"],\"detectedLanguage\":{\"language\":\"en\",\"confidence\":90}}");
            assertThat(cliente.traducir(List.of("Hello"), "auto", "es").origenDetectado()).isEqualTo("en");
            servidor.reset();
            responde("{\"translatedText\":[\"a\",\"b\"],\"detectedLanguage\":[{\"language\":\"\"},{\"language\":\"es\"}]}");
            TraductorClient.Lote lote = cliente.traducir(List.of("a", "b"), "auto", "es");
            assertThat(lote.traducciones()).containsExactly("a", "b");
            assertThat(lote.origenDetectado()).isEqualTo("es");
            servidor.reset();
            responde("{\"translatedText\":[\"a\"],\"detectedLanguage\":[{}]}");
            assertThat(cliente.traducir(List.of("a"), "auto", "es").origenDetectado()).isNull();
            servidor.reset();
            responde("{\"translatedText\":[\"a\"],\"detectedLanguage\":null}");
            assertThat(cliente.traducir(List.of("a"), "en", "es").origenDetectado()).isNull();
            servidor.reset();
            responde("{\"translatedText\":[\"a\"]}");
            assertThat(cliente.traducir(List.of("a"), "en", "es").origenDetectado()).isNull();
        }

        @Test
        @DisplayName("QA NU-02: /detect devuelve idioma y confianza; vacio, raro o caido da null (no impide traducir)")
        void detectar() {
            servidor.expect(requestTo("http://traductor:5000/detect")).andExpect(method(HttpMethod.POST))
                    .andRespond(withSuccess("[{\"language\":\"es\",\"confidence\":87.5}]", MediaType.APPLICATION_JSON));
            assertThat(cliente.detectar("Hola")).isEqualTo(new TraductorClient.Deteccion("es", 87.5));
            for (String raro : List.of("[]", "{}", "[{\"language\":\"\"}]", "null")) {
                servidor.reset();
                servidor.expect(requestTo("http://traductor:5000/detect"))
                        .andRespond(withSuccess(raro, MediaType.APPLICATION_JSON));
                assertThat(cliente.detectar("x")).as(raro).isNull();
            }
            servidor.reset();
            servidor.expect(requestTo("http://traductor:5000/detect")).andRespond(withSuccess());
            assertThat(cliente.detectar("x")).isNull();
            servidor.reset();
            servidor.expect(requestTo("http://traductor:5000/detect"))
                    .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withServerError());
            assertThat(cliente.detectar("x")).isNull();
        }

        @Test
        @DisplayName("respuesta sin lista, con otro numero de textos o vacia: 503 traductorNoDisponible")
        void respuestasRaras() {
            for (String rara : List.of("{\"translatedText\":\"suelto\"}", "{\"translatedText\":[\"a\",\"b\"]}", "{}")) {
                servidor.reset();
                responde(rara);
                assertThatThrownBy(() -> cliente.traducir(List.of("a"), "en", "es"))
                        .isInstanceOfSatisfying(ValidationException.class, e -> {
                            assertThat(e.getClave()).isEqualTo(Message.Msj.traductorNoDisponible);
                            assertThat(e.getCodigo()).isEqualTo(503);
                        });
            }
            servidor.reset();
            servidor.expect(requestTo("http://traductor:5000/translate")).andRespond(withSuccess());
            assertThatThrownBy(() -> cliente.traducir(List.of("a"), "en", "es")).isInstanceOf(ValidationException.class);
        }

        @Test
        @DisplayName("traductor que no escucha: 503, nunca una excepcion sin traducir")
        void sinConexion() {
            SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
            fabrica.setConnectTimeout(300);
            TraductorClient caido = new TraductorClient(RestClient.builder().baseUrl("http://127.0.0.1:9")
                    .requestFactory(fabrica).build());
            assertThatThrownBy(() -> caido.traducir(List.of("a"), "en", "es"))
                    .isInstanceOfSatisfying(ValidationException.class,
                            e -> assertThat(e.getCodigo()).isEqualTo(503));
        }
    }

    @Nested
    @DisplayName("TraduccionServiceImpl")
    class Servicio {

        private final EjemplarRepository ejemplares = mock(EjemplarRepository.class);
        private final TraductorDeCapitulos capitulos = mock(TraductorDeCapitulos.class);

        private TraduccionServiceImpl servicio(long capitulosPorHora) {
            return new TraduccionServiceImpl(ejemplares, mock(TraduccionRepository.class), mock(TraductorClient.class),
                    capitulos, " EN, es ,,es",
                    new LimitadorPorUsuario(100, Duration.ofMinutes(1), reloj),
                    new LimitadorPorUsuario(capitulosPorHora, Duration.ofHours(1), reloj));
        }

        @Test
        @DisplayName("el origen sale del idioma del libro: en-US -> en, ES -> es; raro o vacio -> auto")
        void origenDelLibro() {
            TraduccionServiceImpl s = servicio(1);
            assertThat(s.origenDelLibro("en-US")).isEqualTo("en");
            assertThat(s.origenDelLibro("ES")).isEqualTo("es");
            assertThat(s.origenDelLibro("fr")).isEqualTo("auto");
            assertThat(s.origenDelLibro("e")).isEqualTo("auto");
            assertThat(s.origenDelLibro(null)).isEqualTo("auto");
        }

        @Test
        @DisplayName("el freno de capitulos solo se aplica al lanzar uno nuevo: pasado el cupo, 429")
        void frenoDeCapitulos() {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("x", null, List.of());
            auth.setDetails(5L);
            SecurityContextHolder.getContext().setAuthentication(auth);
            Archivo archivo = new Archivo();
            archivo.setId(UUID.randomUUID());
            archivo.setEstadoConversion(Archivo.LISTO);
            Ejemplar ejemplar = new Ejemplar();
            ejemplar.setArchivo(archivo);
            when(ejemplares.delUsuario(any(), eq(5L))).thenReturn(Optional.of(ejemplar));
            when(capitulos.consultar(any(), anyInt(), anyString(), anyString(), eq(false), any())).thenAnswer(i -> {
                ((Runnable) i.getArgument(5)).run();
                return CapituloTraducidoDTO.builder().estado("PENDIENTE").build();
            });
            TraduccionServiceImpl s = servicio(1);
            TraducirCapituloDTO peticion = TraducirCapituloDTO.builder().ejemplarId(UUID.randomUUID()).capitulo(0).build();

            assertThat(s.capitulo(peticion).getEstado()).isEqualTo("PENDIENTE");
            assertThatThrownBy(() -> s.capitulo(peticion))
                    .isInstanceOfSatisfying(ValidationException.class, e -> {
                        assertThat(e.getClave()).isEqualTo(Message.Msj.demasiadosCapitulosTraducidos);
                        assertThat(e.getCodigo()).isEqualTo(429);
                        assertThat(e.getArgumentos()).containsExactly("1");
                    });
        }
    }

    @Nested
    @DisplayName("TraductorDeCapitulos")
    class Capitulos {

        @TempDir Path datos;
        private final TraductorClient cliente = mock(TraductorClient.class);
        private final UUID archivo = UUID.randomUUID();

        private TraductorDeCapitulos traductor() {
            return new TraductorDeCapitulos(new AlmacenDeArchivos(datos.toString()), cliente, new ObjectMapper(),
                    mensajes(), Runnable::run, reloj, 10, 40, 4000, 60);
        }

        private void frases(String json) throws Exception {
            Path ruta = datos.resolve("normalizados/" + archivo + "/frases/cap-000.json");
            Files.createDirectories(ruta.getParent());
            Files.writeString(ruta, json, StandardCharsets.UTF_8);
        }

        @Test
        @DisplayName("un fallo inesperado deja ERROR con mensaje generico; pasado el plazo se relanza solo")
        void falloInesperado() throws Exception {
            frases("{\"frases\":[{\"id\":\"c000-s00000\",\"texto\":\"A rather long sentence here.\"}]}");
            when(cliente.traducir(any(), any(), any())).thenThrow(new IllegalStateException("bum"));
            TraductorDeCapitulos t = traductor();

            CapituloTraducidoDTO primero = t.consultar(archivo, 0, "en", "es", false, () -> { });
            assertThat(primero.getEstado()).isEqualTo("PENDIENTE");
            CapituloTraducidoDTO error = t.consultar(archivo, 0, "en", "es", false, () -> { });
            assertThat(error.getEstado()).isEqualTo("ERROR");
            assertThat(error.getError()).isEqualTo("No se pudo traducir el capítulo: "
                    + "Ocurrió un error inesperado procesando la petición. Inténtalo de nuevo.");

            doReturn(new TraductorClient.Lote(List.of("Una frase bastante larga."), null))
                    .when(cliente).traducir(any(), any(), any());
            ahora[0] = ahora[0].plusSeconds(61);
            assertThat(t.consultar(archivo, 0, "en", "es", false, () -> { }).getEstado()).isEqualTo("PENDIENTE");
            CapituloTraducidoDTO listo = t.consultar(archivo, 0, "en", "es", false, () -> { });
            assertThat(listo.getEstado()).isEqualTo("LISTO");
            assertThat(listo.getFrases().get(0).getTexto()).isEqualTo("Una frase bastante larga.");
        }

        @Test
        @DisplayName("frases ilegibles: error de proceso (103 en la API), sin llamar al traductor")
        void frasesIlegibles() throws Exception {
            frases("{esto no es json");
            assertThatThrownBy(() -> traductor().consultar(archivo, 0, "en", "es", false, () -> { }))
                    .hasMessageContaining("frases ilegibles");
            verifyNoInteractions(cliente);
        }

        @Test
        @DisplayName("un capitulo sin frases queda LISTO vacio; el progreso de 0 frases es 0")
        void vacio() throws Exception {
            frases("{\"frases\":[]}");
            assertThat(traductor().consultar(archivo, 0, "en", "es", false, () -> { }).getFrases()).isEmpty();
            assertThat(new TraductorDeCapitulos.EnCurso(0).progreso()).isZero();
            TraductorDeCapitulos.EnCurso medio = new TraductorDeCapitulos.EnCurso(4);
            medio.hechas.set(4);
            assertThat(medio.progreso()).as("nunca 100 mientras no este guardado").isEqualTo(99);
        }

        @Test
        @DisplayName("si no se puede guardar el resultado, la peticion corta falla con log (no queda nada a medias)")
        void sinPoderGuardar() throws Exception {
            frases("{\"frases\":[{\"id\":\"c000-s00000\",\"texto\":\"Hi.\"}]}");
            when(cliente.traducir(any(), any(), any())).thenReturn(new TraductorClient.Lote(List.of("Hola."), null));
            Files.writeString(datos.resolve("normalizados/" + archivo + "/traducciones"), "un fichero, no carpeta");

            assertThatThrownBy(() -> traductor().consultar(archivo, 0, "en", "es", false, () -> { }))
                    .hasMessageContaining("no se pudo guardar la traduccion");
        }
    }

    @Nested
    @DisplayName("TareaCacheDeTraducciones")
    class Tarea {

        @Test
        @DisplayName("si la base falla, deja log y no revienta el planificador")
        void falla() {
            TraduccionRepository repo = mock(TraduccionRepository.class);
            when(repo.purgar(180)).thenThrow(new IllegalStateException("sin base"));
            assertThatCode(() -> new TareaCacheDeTraducciones(repo, 180).revisar()).doesNotThrowAnyException();
            TraduccionRepository vacio = mock(TraduccionRepository.class);
            assertThatCode(() -> new TareaCacheDeTraducciones(vacio, 180).revisar()).doesNotThrowAnyException();
        }
    }
}
