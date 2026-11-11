package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Archivos binarios (GET con Range y ?t=) y estado del audio")
class ArchivosYAudioTest extends PostgresDeVerdad {

    private static final String VOZ = "edge.es-ES-AlvaroNeural";
    private String ejemplar;
    private UUID archivo;
    private byte[] audio;

    @BeforeEach
    void libroConvertido() throws Exception {
        JsonNode e = subirLibro(ANDERSON, "libro.epub");
        ejemplar = e.get("id").asText();
        archivo = uuid(e.get("archivoId"));
        audio = new byte[1000];
        for (int i = 0; i < audio.length; i++) audio[i] = (byte) i;
        escribir(DATOS.resolve("audio/" + archivo + "/" + VOZ + "/cap-003.m4a"), audio);
        escribir(DATOS.resolve("audio/" + archivo + "/" + VOZ + "/cap-003.tiempos.json"),
                "{\"capitulo\":3}".getBytes(StandardCharsets.UTF_8));
        escribir(DATOS.resolve("normalizados/" + archivo + "/libro.epub"), epub("normalizado"));
        escribir(DATOS.resolve("normalizados/" + archivo + "/portada.jpg"), new byte[]{(byte) 0xFF, (byte) 0xD8});
        escribir(DATOS.resolve("muestras/" + VOZ + ".mp3"), new byte[]{1, 2, 3});
    }

    private MockHttpServletRequestBuilder bajar(String ruta) {
        return get("/biblioteca" + ruta).contextPath("/biblioteca");
    }

    private String rutaAudio(String fichero) {
        return "/v1/archivos/" + archivo + "/audio/" + VOZ + "/" + fichero;
    }

    @Nested
    @DisplayName("Range y tipos de contenido")
    class Range {

        @Test
        @DisplayName("sin Range devuelve 200 completo y anuncia Accept-Ranges")
        void completo() throws Exception {
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).param("t", token(ANDERSON)))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Accept-Ranges", "bytes"))
                    .andExpect(header().string("Content-Type", "audio/mp4"))
                    .andExpect(content().bytes(audio));
        }

        @Test
        @DisplayName("con Range devuelve 206 con exactamente esos bytes")
        void parcial() throws Exception {
            byte[] esperado = new byte[100];
            System.arraycopy(audio, 100, esperado, 0, 100);
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).header("Range", "bytes=100-199")
                            .header("Authorization", bearer(ANDERSON)))
                    .andExpect(status().isPartialContent())
                    .andExpect(header().string("Content-Range", "bytes 100-199/1000"))
                    .andExpect(content().bytes(esperado));
        }

        @org.junit.jupiter.params.ParameterizedTest(name = "Range: {0}")
        @org.junit.jupiter.params.provider.ValueSource(strings = {"bytes=10-5", "abc", "bytes=-0", "bytes=999999-",
                "bytes=50-1", "bytes=1000-"})
        @DisplayName("QA SE-16 c: Range invalido o fuera del archivo: 416 SIN cuerpo y Content-Range bytes */tamano")
        void rangoInvalido(String rango) throws Exception {
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).header("Range", rango).param("t", token(ANDERSON)))
                    .andExpect(status().isRequestedRangeNotSatisfiable())
                    .andExpect(header().string("Content-Range", "bytes */1000"))
                    .andExpect(header().string("Accept-Ranges", "bytes"))
                    .andExpect(content().bytes(new byte[0]));
            mvc.perform(bajar("/v1/archivos/" + archivo + "/original").header("Range", rango)
                            .param("t", token(ANDERSON)))
                    .andExpect(status().isRequestedRangeNotSatisfiable())
                    .andExpect(header().string("Content-Range", "bytes */" + epub("libro.epub").length))
                    .andExpect(content().bytes(new byte[0]));
        }

        @Test
        @DisplayName("QA SE-16 c: un Range valido en el borde (ultimo byte, sufijo) sigue dando 206")
        void rangoEnElBorde() throws Exception {
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).header("Range", "bytes=999-").param("t", token(ANDERSON)))
                    .andExpect(status().isPartialContent())
                    .andExpect(header().string("Content-Range", "bytes 999-999/1000"))
                    .andExpect(content().bytes(new byte[]{audio[999]}));
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).header("Range", "bytes=-2").param("t", token(ANDERSON)))
                    .andExpect(status().isPartialContent())
                    .andExpect(content().bytes(new byte[]{audio[998], audio[999]}));
        }

        @Test
        @DisplayName("cada binario con su tipo: EPUB, JPEG, JSON, MP3 y el original con su nombre")
        void tipos() throws Exception {
            String t = token(ANDERSON);
            mvc.perform(bajar("/v1/archivos/" + archivo + "/libro.epub").param("t", t))
                    .andExpect(header().string("Content-Type", "application/epub+zip"));
            mvc.perform(bajar("/v1/archivos/" + archivo + "/portada.jpg").param("t", t))
                    .andExpect(header().string("Content-Type", "image/jpeg"));
            mvc.perform(bajar(rutaAudio("cap-003.tiempos.json")).param("t", t))
                    .andExpect(header().string("Content-Type", "application/json"));
            mvc.perform(bajar("/v1/voces/" + VOZ + "/muestra.mp3").param("t", t))
                    .andExpect(header().string("Content-Type", "audio/mpeg"));
            mvc.perform(bajar("/v1/archivos/" + archivo + "/original").param("t", t))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Type", "application/epub+zip"))
                    .andExpect(header().string("Content-Disposition", startsWith("inline; filename=")))
                    .andExpect(content().bytes(epub("libro.epub")));
            mvc.perform(head("/biblioteca/v1/archivos/" + archivo + "/libro.epub").contextPath("/biblioteca")
                    .param("t", t)).andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("Errores con codigo HTTP")
    class Errores {

        @Test
        @DisplayName("sin token 401; token falso 401 JSON (nunca 500)")
        void sinToken() throws Exception {
            mvc.perform(bajar(rutaAudio("cap-003.m4a"))).andExpect(status().isUnauthorized());
            mvc.perform(bajar(rutaAudio("cap-003.m4a")).param("t", "no.es.jwt"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.errorCode").value(401))
                    .andExpect(jsonPath("$.correct").value(false));
        }

        @Test
        @DisplayName("?t= solo vale en binarios: en la API POST no autentica")
        void tokenEnUrlSoloEnBinarios() throws Exception {
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca").param("t", token(ANDERSON)))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("fichero inexistente o nombre no permitido: 404")
        void noExiste() throws Exception {
            String t = token(ANDERSON);
            mvc.perform(bajar(rutaAudio("cap-004.m4a")).param("t", t)).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.errorCode").value(102));
            mvc.perform(bajar(rutaAudio("cap-3.m4a")).param("t", t)).andExpect(status().isNotFound());
            mvc.perform(bajar("/v1/archivos/" + archivo + "/audio/evil..x/cap-003.m4a").param("t", t))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value(120));
            mvc.perform(bajar("/v1/archivos/" + UUID.randomUUID() + "/libro.epub").param("t", t))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("si /datos no esta montado: 503 con mensaje claro, y la API de datos sigue respondiendo")
        void sinDatos() throws Exception {
            borrar(DATOS);
            try {
                mvc.perform(bajar(rutaAudio("cap-003.m4a")).param("t", token(ANDERSON)))
                        .andExpect(status().isServiceUnavailable())
                        .andExpect(jsonPath("$.errorCode").value(503))
                        .andExpect(jsonPath("$.message").value(startsWith("Los archivos de la biblioteca no están disponibles")));
                mvc.perform(bajar("/v1/archivos/" + archivo + "/original").param("t", token(ANDERSON)))
                        .andExpect(status().isServiceUnavailable());
                assertThat(pedir(ANDERSON, "/v1/libros/get/" + ejemplar).get("correct").asBoolean()).isTrue();
                assertThat(pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", ejemplar, "capitulo", 2))
                        .get("correct").asBoolean()).isTrue();
            } finally {
                Files.createDirectories(DATOS);
            }
        }
    }

    @Nested
    @DisplayName("Estado del audio")
    class Audio {

        private JsonNode estado(int capitulo) throws Exception {
            return pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", VOZ, "capitulo", capitulo));
        }

        private int trabajosDeVoz() {
            return jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'", Integer.class);
        }

        @Test
        @DisplayName("con el libro sin convertir responde CONVIRTIENDO y no encola nada (contrato v1.1)")
        void convirtiendo() throws Exception {
            assertThat(estado(0).get("object").get("estado").asText()).isEqualTo("CONVIRTIENDO");
            jdbc.update("UPDATE bah_lib_archivo SET estado_conversion = 'ERROR' WHERE id = ?", archivo);
            assertThat(estado(0).get("object").get("estado").asText()).isEqualTo("ERROR_CONVERSION");
            assertThat(trabajosDeVoz()).isZero();
        }

        @Test
        @DisplayName("si falta, encola el capitulo (prioridad 10) y los 2 siguientes (20), sin duplicar")
        void encola() throws Exception {
            marcarListo(archivo, 4, "{}");
            JsonNode r = estado(2).get("object");

            assertThat(r.get("estado").asText()).isEqualTo("PENDIENTE");
            assertThat(r.get("url1x").isNull()).isTrue();
            assertThat(jdbc.queryForList("SELECT (payload->>'capitulo')::int AS c, prioridad FROM bah_lib_trabajo "
                    + "WHERE tipo = 'VOZ_CAPITULO' ORDER BY 1")).extracting(m -> m.get("c") + ":" + m.get("prioridad"))
                    .containsExactly("2:10", "3:20");
            estado(2);
            assertThat(trabajosDeVoz()).as("pedirlo otra vez no duplica").isEqualTo(2);
        }

        @Test
        @DisplayName("LISTO devuelve duracion y URLs relativas al gateway; ERROR se informa con su motivo y no se reencola (DA-02)")
        void listo() throws Exception {
            marcarListo(archivo, 10, "{}");
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg) "
                    + "VALUES (?, ?, 3, 'LISTO', 1234.56)", archivo, VOZ);
            JsonNode r = estado(3).get("object");

            String base = "/BIBLIOTECA-SERVICE/biblioteca/v1/archivos/" + archivo + "/audio/" + VOZ + "/cap-003";
            assertThat(r.get("estado").asText()).isEqualTo("LISTO");
            assertThat(r.get("duracionSeg").asDouble()).isEqualTo(1234.56);
            assertThat(r.get("url1x").asText()).isEqualTo(base + ".m4a");
            assertThat(r.get("url2x").asText()).isEqualTo(base + "-2x.m4a");
            assertThat(r.get("urlTiempos").asText()).isEqualTo(base + ".tiempos.json");

            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, error) "
                    + "VALUES (?, ?, 6, 'ERROR', 'fallo')", archivo, VOZ);
            int antes = trabajosDeVoz();
            JsonNode error = estado(6).get("object");
            assertThat(error.get("estado").asText()).isEqualTo("ERROR");
            assertThat(error.get("error").asText()).isEqualTo("fallo");
            assertThat(trabajosDeVoz()).as("consultar un ERROR no lo vuelve a encolar").isEqualTo(antes + 2);
            assertThat(estado(6).get("object").get("estado").asText()).isEqualTo("ERROR");
            assertThat(trabajosDeVoz()).isEqualTo(antes + 2);
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado) VALUES (?, ?, 9, 'GENERANDO')",
                    archivo, VOZ);
            assertThat(estado(9).get("object").get("estado").asText()).isEqualTo("GENERANDO");
        }

        @Test
        @DisplayName("capitulo fuera de rango, voz invalida o libro sin archivo responden 120")
        void reglas() throws Exception {
            marcarListo(archivo, 2, "{}");
            assertThat(estado(5).get("message").asText()).isEqualTo("El libro tiene 2 capítulo(s): elige uno entre 0 y 1.");
            assertThat(pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", "../x", "capitulo", 0))
                    .get("message").asText()).isEqualTo("La voz \"../x\" no es válida.");
            String deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "X")).get("object").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", deseo, "vozId", VOZ, "capitulo", 0))
                    .get("message").asText()).isEqualTo("Este libro no tiene archivo.");
            jdbc.update("UPDATE bah_lib_archivo SET n_capitulos = NULL WHERE id = ?", archivo);
            assertThat(estado(40).get("object").get("estado").asText()).isEqualTo("PENDIENTE");
        }
    }

    @Test
    @DisplayName("voces: si el taller no responde, el catalogo inicial con Alvaro por defecto")
    void vocesDeRespaldo() throws Exception {
        JsonNode voces = pedir(ANDERSON, "/v1/voces/all").get("object");
        assertThat(voces).hasSize(9);
        assertThat(voces.get(0).get("id").asText()).isEqualTo(VOZ);
        assertThat(voces.get(0).get("porDefecto").asBoolean()).isTrue();
        assertThat(voces.get(1).get("porDefecto").asBoolean()).isFalse();
    }
}
