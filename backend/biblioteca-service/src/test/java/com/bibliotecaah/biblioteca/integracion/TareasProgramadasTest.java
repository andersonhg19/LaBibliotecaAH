package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.service.impl.TareaBuzon;
import com.bibliotecaah.biblioteca.service.impl.TareaMetadatos;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Tareas programadas: metadatos del taller y buzon")
class TareasProgramadasTest extends PostgresDeVerdad {

    @Autowired private TareaMetadatos metadatos;
    @Autowired private TareaBuzon buzon;

    @Nested
    @DisplayName("Metadatos")
    class Metadatos {

        @Test
        @DisplayName("un archivo LISTO copia sus metadatos a las obras provisionales, no a las MANUAL, y una sola vez")
        void aplica() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            JsonNode s = subir(SAMY, "libro.epub", epub("libro.epub")).get("object").get(0);
            pedir(SAMY, "/v1/libros/save", Map.of("id", s.get("id").asText(), "titulo", "Mi titulo"));
            UUID archivo = uuid(a.get("archivoId"));
            marcarListo(archivo, 3, "{\"titulo\":\"Rayuela\",\"autores\":[\"Julio Cortázar\",\"Julio Cortázar\",\" \"],"
                    + "\"idioma\":\"es\",\"isbn\":\"978-84\",\"editorial\":\"Sudamericana\",\"anio\":\"1963\","
                    + "\"sinopsis\":\"Un juego\"}");

            metadatos.revisar();

            JsonNode de = pedir(ANDERSON, "/v1/libros/get/" + a.get("id").asText()).get("object");
            assertThat(de.get("titulo").asText()).isEqualTo("Rayuela");
            assertThat(de.get("autores")).hasSize(1);
            assertThat(de.get("anio").asInt()).isEqualTo(1963);
            assertThat(de.get("idioma").asText()).isEqualTo("es");
            assertThat(de.get("isbn").asText()).isEqualTo("978-84");
            assertThat(de.get("editorial").asText()).isEqualTo("Sudamericana");
            assertThat(de.get("sinopsis").asText()).isEqualTo("Un juego");
            assertThat(de.get("fuenteMetadatos").asText()).isEqualTo("ARCHIVO");
            assertThat(de.get("tienePortada").asBoolean()).isTrue();
            assertThat(pedir(SAMY, "/v1/libros/get/" + s.get("id").asText()).get("object").get("titulo").asText())
                    .isEqualTo("Mi titulo");
            assertThat(jdbc.queryForObject("SELECT metadatos_aplicados FROM bah_lib_archivo WHERE id = ?",
                    Boolean.class, archivo)).isTrue();
        }

        @Test
        @DisplayName("metadatos vacios, ilegibles o que no son un objeto dejan el titulo provisional")
        void metadatosRaros() throws Exception {
            for (String raro : new String[]{null, "[1,2]", "{\"titulo\":null,\"anio\":\"MCMLX\"}"}) {
                limpiarTodo();
                JsonNode a = subirLibro(ANDERSON, "mi_libro.epub");
                marcarListo(uuid(a.get("archivoId")), 1, raro);
                metadatos.revisar();
                assertThat(pedir(ANDERSON, "/v1/libros/get/" + a.get("id").asText()).get("object").get("titulo").asText())
                        .isEqualTo("mi libro");
            }
            assertThat(metadatos.aplicar(new com.bibliotecaah.biblioteca.entity.Obra(), "{no es json")).isFalse();
        }
    }

    @Nested
    @DisplayName("Buzon")
    class Buzon {

        @Test
        @DisplayName("importa por correo (BUZON_USUARIOS) o por userId y mueve a importados/rechazados")
        void importa() throws Exception {
            Path deAnderson = DATOS.resolve("buzon/anderson@biblioteca.ah");
            Path deSamy = DATOS.resolve("buzon/2");
            escribir(deAnderson.resolve("nuevo.epub"), epub("buzon"));
            escribir(deAnderson.resolve("raro.exe"), new byte[]{1});
            escribir(deAnderson.resolve(".oculto.epub"), epub("oculto"));
            escribir(deAnderson.resolve("descargando.epub.part"), epub("parcial"));
            escribir(deSamy.resolve("suyo.pdf"), pdf("samy"));
            escribir(DATOS.resolve("buzon/desconocido@x.com/x.epub"), epub("nadie"));

            buzon.revisar();

            assertThat(Files.exists(deAnderson.resolve("importados/nuevo.epub"))).isTrue();
            assertThat(Files.exists(deAnderson.resolve("rechazados/raro.exe"))).isTrue();
            assertThat(Files.exists(deAnderson.resolve(".oculto.epub"))).isTrue();
            assertThat(Files.exists(deAnderson.resolve("descargando.epub.part"))).isTrue();
            assertThat(Files.exists(deSamy.resolve("importados/suyo.pdf"))).isTrue();
            assertThat(Files.exists(DATOS.resolve("buzon/desconocido@x.com/x.epub"))).isTrue();
            assertThat(pedir(ANDERSON, "/v1/libros/all").get("object").get("list").get(0).get("titulo").asText())
                    .isEqualTo("nuevo");
            assertThat(pedir(SAMY, "/v1/libros/all").get("object").get("totalElements").asInt()).isEqualTo(1);

            escribir(deAnderson.resolve("nuevo.epub"), epub("buzon"));
            buzon.revisar();
            assertThat(Files.list(deAnderson.resolve("importados")).count())
                    .as("un nombre repetido en importados no pisa el anterior").isEqualTo(2);
        }

        @Test
        @DisplayName("sin carpeta de buzon o sin /datos no hace nada")
        void sinBuzon() throws Exception {
            buzon.revisar();
            borrar(DATOS);
            buzon.revisar();
            Files.createDirectories(DATOS);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class)).isZero();
        }
    }
}
