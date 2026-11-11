package com.bibliotecaah.biblioteca.unitarias;

import com.bibliotecaah.biblioteca.client.TallerClient;
import com.bibliotecaah.biblioteca.dto.output.VozDTO;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.event.RegistroDeCambiosListener;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.service.impl.VozServiceImpl;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.DetectorDeFormato;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.client.ResourceAccessException;

import java.io.IOException;
import java.lang.reflect.Constructor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("Piezas sueltas sin base de datos")
class PiezasSueltasTest {

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("DetectorDeFormato")
    class Detector {

        @Test
        @DisplayName("la extension decide el formato esperado, sin importar mayusculas")
        void extension() {
            assertThat(DetectorDeFormato.porExtension("A.EPUB")).isEqualTo(Formato.EPUB);
            assertThat(DetectorDeFormato.porExtension("a.docx")).isEqualTo(Formato.DOCX);
            assertThat(DetectorDeFormato.porExtension("sin-extension")).isNull();
            assertThat(DetectorDeFormato.porExtension(null)).isNull();
            assertThat(DetectorDeFormato.porExtension("a.mobi")).isNull();
        }

        @Test
        @DisplayName("los bytes deben coincidir; un PDF admite basura antes de la cabecera")
        void bytes() {
            assertThat(DetectorDeFormato.coincide(Formato.PDF, "xx%PDF-1.4".getBytes())).isTrue();
            assertThat(DetectorDeFormato.coincide(Formato.PDF, "%PD".getBytes())).isFalse();
            assertThat(DetectorDeFormato.coincide(Formato.EPUB, new byte[]{0x50})).isFalse();
            assertThat(DetectorDeFormato.coincide(Formato.TXT, new byte[0])).isFalse();
            assertThat(DetectorDeFormato.coincide(Formato.DOC, "PK".getBytes())).isFalse();
        }
    }

    @Nested
    @DisplayName("AlmacenDeArchivos")
    class Almacen {

        @Test
        @DisplayName("sanear quita tildes, rutas y caracteres raros y recorta conservando la extension")
        void sanear() {
            assertThat(AlmacenDeArchivos.sanear("C:\\x\\Cien años: ¿soledad?.epub")).isEqualTo("Cien_anos_soledad_.epub");
            assertThat(AlmacenDeArchivos.sanear("../../etc/passwd")).isEqualTo("passwd");
            assertThat(AlmacenDeArchivos.sanear("...")).isEqualTo("archivo");
            assertThat(AlmacenDeArchivos.sanear(null)).isEqualTo("archivo");
            String largo = AlmacenDeArchivos.sanear("a".repeat(300) + ".epub");
            assertThat(largo).hasSize(120).endsWith(".epub");
            assertThat(AlmacenDeArchivos.sanear("b".repeat(300))).hasSize(120);
        }

        @Test
        @DisplayName("borrarTodoDe borra las tres zonas del archivo y nunca lanza")
        void borrar() throws IOException {
            Path raiz = Files.createTempDirectory("almacen");
            AlmacenDeArchivos almacen = new AlmacenDeArchivos(raiz.toString());
            UUID id = UUID.randomUUID();
            Files.createDirectories(almacen.carpetaOriginal(id));
            Files.writeString(almacen.carpetaOriginal(id).resolve("x.epub"), "x");
            Files.createDirectories(almacen.audio(id, "v", "a").getParent());

            almacen.borrarTodoDe(id);

            assertThat(Files.exists(almacen.carpetaOriginal(id))).isFalse();
            assertThat(Files.exists(raiz.resolve("audio").resolve(id.toString()))).isFalse();
            AlmacenDeArchivos ausente = new AlmacenDeArchivos(raiz.resolve("no-existe").toString());
            assertThatCode(() -> ausente.borrarTodoDe(id)).doesNotThrowAnyException();
            assertThat(ausente.disponible()).isFalse();
        }
    }

    @Nested
    @DisplayName("ValidationUtils y SecurityUtils")
    class Utilidades {

        @Test
        @DisplayName("ids seguros: ni barras, ni '..', ni vacios")
        void idSeguro() {
            assertThat(ValidationUtils.idSeguro("edge.es-ES-AlvaroNeural")).isTrue();
            assertThat(ValidationUtils.idSeguro("a/b")).isFalse();
            assertThat(ValidationUtils.idSeguro("a..b")).isFalse();
            assertThat(ValidationUtils.idSeguro(null)).isFalse();
            assertThat(ValidationUtils.calificacion(null)).isNull();
            assertThat(ValidationUtils.calificacion(0.5)).isEqualByComparingTo("0.5");
        }

        @Test
        @DisplayName("sin token, o con un token sin userId, la identidad es 401")
        void identidad() {
            assertThatThrownBy(SecurityUtils::usuarioActual).isInstanceOf(ValidationException.class)
                    .extracting("codigo").isEqualTo(401);
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("x", null, List.of());
            auth.setDetails("no-soy-un-long");
            SecurityContextHolder.getContext().setAuthentication(auth);
            assertThat(SecurityUtils.getAuthenticatedUserId()).isNull();
            auth.setDetails(7L);
            assertThat(SecurityUtils.usuarioActual()).isEqualTo(7L);
        }

        @Test
        @DisplayName("las clases de utilidades no se instancian")
        void sinInstancias() throws Exception {
            for (Class<?> c : List.of(ValidationUtils.class, SecurityUtils.class, DetectorDeFormato.class,
                    com.bibliotecaah.biblioteca.util.CodigoError.class, com.bibliotecaah.biblioteca.enums.Message.class)) {
                Constructor<?> k = c.getDeclaredConstructor();
                k.setAccessible(true);
                assertThat(k.newInstance()).isNotNull();
            }
        }
    }

    @Nested
    @DisplayName("VozServiceImpl")
    class Voces {

        private final TallerClient taller = mock(TallerClient.class);
        private final Instant[] ahora = {Instant.parse("2026-11-10T12:00:00Z")};
        private final Clock reloj = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId z) { return this; }
            @Override public Instant instant() { return ahora[0]; }
        };

        private VozServiceImpl servicio() throws Exception {
            Constructor<VozServiceImpl> k = VozServiceImpl.class.getDeclaredConstructor(TallerClient.class, String.class, Clock.class);
            k.setAccessible(true);
            return k.newInstance(taller, "edge.es-ES-AlvaroNeural", reloj);
        }

        @Test
        @DisplayName("usa el catalogo del taller (con su porDefecto) y lo guarda 10 minutos")
        void delTaller() throws Exception {
            when(taller.voces()).thenReturn(List.of(
                    Map.of("id", "edge.es-CO-SalomeNeural", "nombre", "Salomé", "pais", "Colombia", "genero", "F",
                            "motor", "edge", "porDefecto", true),
                    Map.of("id", "piper.carlos")));
            VozServiceImpl s = servicio();

            List<VozDTO> voces = s.getAll();
            s.getAll();

            assertThat(voces).hasSize(2);
            assertThat(voces.get(0).isPorDefecto()).isTrue();
            assertThat(voces.get(1).getNombre()).isEqualTo("piper.carlos");
            assertThat(voces.get(1).getMotor()).isEqualTo("piper");
            assertThat(voces.get(1).isPorDefecto()).isFalse();
            verify(taller, times(1)).voces();
            ahora[0] = ahora[0].plus(Duration.ofMinutes(11));
            s.getAll();
            verify(taller, times(2)).voces();
        }

        @Test
        @DisplayName("si el taller falla o responde vacio, catalogo inicial de 9 voces con Alvaro por defecto")
        void respaldo() throws Exception {
            when(taller.voces()).thenThrow(new ResourceAccessException("caido")).thenReturn(List.of()).thenReturn(null);
            VozServiceImpl s = servicio();
            for (int i = 0; i < 3; i++) {
                List<VozDTO> voces = s.getAll();
                assertThat(voces).hasSize(9);
                assertThat(voces.stream().filter(VozDTO::isPorDefecto).map(VozDTO::getId))
                        .containsExactly("edge.es-ES-AlvaroNeural");
            }
            when(taller.voces()).thenReturn(List.of(Map.of("id", "sin.motor")));
            assertThat(s.getAll().get(0).getMotor()).isEqualTo("sin");
        }
    }

    @Nested
    @DisplayName("RegistroDeCambiosListener")
    class Cambios {

        @Test
        @DisplayName("recorta el detalle a 1000 caracteres y un fallo de la base no se propaga")
        void nuncaTumba() {
            JdbcTemplate jdbc = mock(JdbcTemplate.class);
            RegistroDeCambiosListener l = new RegistroDeCambiosListener(jdbc);
            l.registrar(new EntityChangeEvent("Ejemplar", "1", EntityChangeEvent.Accion.CREAR, 1L, "x".repeat(2000)));
            verify(jdbc).update(anyString(), any(), any(), any(), any(), any(String.class));

            when(jdbc.update(anyString(), any(), any(), any(), any(), any())).thenThrow(new IllegalStateException("caida"));
            assertThatCode(() -> l.registrar(new EntityChangeEvent("E", "2", EntityChangeEvent.Accion.BORRAR, null, null)))
                    .doesNotThrowAnyException();
        }
    }
}
