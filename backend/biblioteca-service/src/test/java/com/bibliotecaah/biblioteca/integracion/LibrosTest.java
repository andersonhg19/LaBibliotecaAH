package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Libros: subir, deduplicar, editar, borrar y deseos")
class LibrosTest extends PostgresDeVerdad {

    @Nested
    @DisplayName("Subir")
    class Subir {

        @Test
        @DisplayName("un EPUB crea archivo, obra con titulo del nombre, ejemplar y trabajo CONVERTIR")
        void subeUnEpub() throws Exception {
            JsonNode r = subir(ANDERSON, "cien_anos-de.soledad.epub", epub("a"));

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.get("errorCode").asInt()).isZero();
            JsonNode e = r.get("object").get(0);
            assertThat(e.get("titulo").asText()).isEqualTo("cien anos de soledad");
            assertThat(e.get("tipo").asText()).isEqualTo("LIBRO");
            assertThat(e.get("estado").asText()).isEqualTo("POR_LEER");
            assertThat(e.get("formatoOriginal").asText()).isEqualTo("EPUB");
            assertThat(e.get("estadoConversion").asText()).isEqualTo("PENDIENTE");
            assertThat(e.get("fuenteMetadatos").asText()).isEqualTo("NOMBRE_ARCHIVO");
            assertThat(e.get("favorito").asBoolean()).isFalse();
            assertThat(e.get("nNotas").asInt()).isZero();
            assertThat(e.has("nnotas")).isFalse();
            assertThat(e.has("creation")).isFalse();

            UUID archivo = uuid(e.get("archivoId"));
            String ruta = jdbc.queryForObject("SELECT ruta_original FROM bah_lib_archivo WHERE id = ?", String.class, archivo);
            assertThat(ruta).isEqualTo("originales/" + archivo + "/cien_anos-de.soledad.epub");
            assertThat(Files.readAllBytes(DATOS.resolve(ruta))).isEqualTo(epub("a"));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'CONVERTIR' "
                    + "AND archivo_id = ? AND prioridad = 100 AND payload = '{}'::jsonb", Integer.class, archivo)).isEqualTo(1);
            assertThat(Files.list(DATOS.resolve("tmp")).count()).as("no quedan temporales").isZero();
        }

        @Test
        @DisplayName("el mismo fichero dos veces para el mismo usuario devuelve el mismo ejemplar")
        void duplicadoMismoUsuario() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            JsonNode b = subir(ANDERSON, "otro-nombre.epub", epub("libro.epub")).get("object").get(0);

            assertThat(b.get("id").asText()).isEqualTo(a.get("id").asText());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo", Integer.class)).isEqualTo(1);
        }

        @Test
        @DisplayName("el mismo fichero de otro usuario reutiliza el archivo y crea su propio ejemplar")
        void duplicadoOtroUsuario() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            JsonNode b = subir(SAMY, "libro.epub", epub("libro.epub")).get("object").get(0);

            assertThat(b.get("archivoId").asText()).isEqualTo(a.get("archivoId").asText());
            assertThat(b.get("id").asText()).isNotEqualTo(a.get("id").asText());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class)).isEqualTo(2);
        }

        @Test
        @DisplayName("un archivo LISTO reutilizado entra ya con los metadatos del taller")
        void duplicadoListoTraeMetadatos() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            marcarListo(uuid(a.get("archivoId")), 5, "{\"titulo\":\"Rayuela\",\"autores\":[\"Julio Cortázar\"],\"anio\":1963}");

            JsonNode b = subir(SAMY, "libro.epub", epub("libro.epub")).get("object").get(0);

            assertThat(b.get("titulo").asText()).isEqualTo("Rayuela");
            assertThat(b.get("autores").get(0).asText()).isEqualTo("Julio Cortázar");
            assertThat(b.get("anio").asInt()).isEqualTo(1963);
            assertThat(b.get("fuenteMetadatos").asText()).isEqualTo("ARCHIVO");
        }

        @Test
        @DisplayName("si la conversion habia fallado, volver a subirlo la reintenta")
        void reintentaSiFallo() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            UUID archivo = uuid(a.get("archivoId"));
            jdbc.update("UPDATE bah_lib_archivo SET estado_conversion = 'ERROR', error_conversion = 'x' WHERE id = ?", archivo);

            subirLibro(ANDERSON, "libro.epub");

            assertThat(jdbc.queryForObject("SELECT estado_conversion FROM bah_lib_archivo WHERE id = ?", String.class, archivo))
                    .isEqualTo("PENDIENTE");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE archivo_id = ?", Integer.class, archivo))
                    .isEqualTo(2);
        }

        @Test
        @DisplayName("varios ficheros a la vez, con el campo archivos[] y como DOCUMENTO")
        void variosYDocumento() throws Exception {
            JsonNode r = subir(ANDERSON, "DOCUMENTO",
                    new MockMultipartFile("archivos[]", "contrato.pdf", "application/pdf", pdf("1")),
                    new MockMultipartFile("archivos[]", "notas.txt", "text/plain", "hola".getBytes(StandardCharsets.UTF_8)));

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.get("object")).hasSize(2);
            assertThat(r.get("object").get(0).get("tipo").asText()).isEqualTo("DOCUMENTO");
            assertThat(r.get("object").get(1).get("formatoOriginal").asText()).isEqualTo("TXT");
        }

        @Test
        @DisplayName("un formato no soportado se rechaza con mensaje en espanol")
        void formatoNoSoportado() throws Exception {
            JsonNode r = subir(ANDERSON, "virus.exe", new byte[]{1, 2, 3});

            assertThat(r.get("correct").asBoolean()).isFalse();
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("No se pudo agregar ningún archivo: "
                    + "\"virus.exe\": formato no soportado. Se aceptan libros (EPUB, PDF), documentos (DOCX, DOC, ODT, RTF, "
                    + "TXT, MD, HTML, PPTX, JSON, YAML, LOG) y hojas de cálculo (XLSX, XLS, ODS, CSV).");
        }

        @Test
        @DisplayName("un .epub que por dentro es un PDF se rechaza; los demas del lote entran")
        void contenidoQueNoCoincide() throws Exception {
            JsonNode r = subir(ANDERSON, "LIBRO",
                    new MockMultipartFile("archivos", "falso.epub", "application/epub+zip", pdf("x")),
                    new MockMultipartFile("archivos", "bueno.epub", "application/epub+zip", epub("bueno")));

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.get("object")).hasSize(1);
            assertThat(r.get("message").asText()).isEqualTo("Se agregaron 1 archivo(s). No se pudieron agregar: "
                    + "\"falso.epub\": no parece un EPUB válido (el contenido no coincide con la extensión).");
        }

        @Test
        @DisplayName("DOC y DOCX se reconocen por sus bytes")
        void docYDocx() throws Exception {
            byte[] ole = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1, 9};
            JsonNode r = subir(ANDERSON, "LIBRO",
                    new MockMultipartFile("archivos", "viejo.doc", "application/msword", ole),
                    new MockMultipartFile("archivos", "nuevo.docx", "application/octet-stream", com.bibliotecaah.biblioteca.Ficheros.docx("docx")),
                    new MockMultipartFile("archivos", "binario.txt", "text/plain", new byte[]{65, 0, 66}));

            assertThat(r.get("object")).hasSize(2);
            assertThat(r.get("object").get(0).get("formatoOriginal").asText()).isEqualTo("DOC");
            assertThat(r.get("object").get(1).get("formatoOriginal").asText()).isEqualTo("DOCX");
            assertThat(r.get("message").asText()).contains("\"binario.txt\": no parece un TXT");
        }

        @Test
        @DisplayName("sin ficheros, o con un fichero vacio, responde 120")
        void sinFicheros() throws Exception {
            JsonNode vacio = subir(ANDERSON, "LIBRO",
                    new MockMultipartFile("otro", "x.epub", "application/epub+zip", epub("x")));
            assertThat(vacio.get("errorCode").asInt()).isEqualTo(120);
            assertThat(vacio.get("message").asText()).isEqualTo("No llegó ningún archivo.");
        }

        @Test
        @DisplayName("si /datos no esta montado, la subida responde 503 y no toca la base")
        void sinDatos() throws Exception {
            borrar(DATOS);
            JsonNode r = subir(ANDERSON, "libro.epub", epub("a"));
            Files.createDirectories(DATOS);

            assertThat(r.get("errorCode").asInt()).isEqualTo(503);
            assertThat(r.get("message").asText()).startsWith("Los archivos de la biblioteca no están disponibles");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class)).isZero();
        }
    }

    @Nested
    @DisplayName("Deseos")
    class Deseos {

        @Test
        @DisplayName("un deseo es un ejemplar DESEO sin archivo, con datos MANUAL")
        void creaDeseo() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/libros/deseo",
                    Map.of("titulo", " El Aleph ", "autor", "Borges", "isbn", "9788499089515", "nota", "regalo"));

            JsonNode e = r.get("object");
            assertThat(e.get("tipo").asText()).isEqualTo("DESEO");
            assertThat(e.get("titulo").asText()).isEqualTo("El Aleph");
            assertThat(e.get("autores").get(0).asText()).isEqualTo("Borges");
            assertThat(e.get("isbn").asText()).isEqualTo("9788499089515");
            assertThat(e.get("archivoId").isNull()).isTrue();
            assertThat(e.get("fuenteMetadatos").asText()).isEqualTo("MANUAL");
        }

        @Test
        @DisplayName("sin titulo responde 120 con el campo")
        void sinTitulo() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/libros/deseo", Map.of("autor", "Borges"));
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("Revisa los datos enviados: titulo es obligatorio.");
        }

        @Test
        @DisplayName("QA BI-15: un deseo NO pasa a LIBRO ni a DOCUMENTO sin archivo; un libro con archivo no vuelve a deseo")
        void cambiosDeTipo() throws Exception {
            JsonNode deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Ficciones")).get("object");
            for (String tipo : List.of("LIBRO", "DOCUMENTO")) {
                JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of("id", deseo.get("id").asText(), "tipo", tipo));
                assertThat(r.get("errorCode").asInt()).isEqualTo(120);
                assertThat(r.get("message").asText()).isEqualTo(
                        "Un deseo pasa a tu biblioteca cuando subes su archivo: usa «Ya lo tengo» y elige el archivo.");
            }
            JsonNode sigue = pedir(ANDERSON, "/v1/libros/get/" + deseo.get("id").asText()).get("object");
            assertThat(sigue.get("tipo").asText()).isEqualTo("DESEO");
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", deseo.get("id").asText(), "tipo", "DESEO",
                    "titulo", "Ficciones (Borges)")).get("correct").asBoolean()).as("DESEO -> DESEO si").isTrue();

            JsonNode libro = subirLibro(ANDERSON, "a.epub");
            JsonNode no = pedir(ANDERSON, "/v1/libros/save", Map.of("id", libro.get("id").asText(), "tipo", "DESEO"));
            assertThat(no.get("errorCode").asInt()).isEqualTo(120);
            assertThat(no.get("message").asText()).isEqualTo("Un libro con archivo no puede volver a la lista de deseos.");
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", libro.get("id").asText(), "tipo", "DOCUMENTO"))
                    .get("object").get("tipo").asText()).as("LIBRO -> DOCUMENTO con archivo si").isEqualTo("DOCUMENTO");
        }

        private JsonNode subirCumpliendo(long usuario, String deseoId, MockMultipartFile... ficheros) throws Exception {
            var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                    .multipart("/biblioteca/v1/libros/subir");
            for (MockMultipartFile f : ficheros) req.file(f);
            req.contextPath("/biblioteca").param("deseoId", deseoId).header("Authorization", bearer(usuario));
            return json.readTree(mvc.perform(req).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        }

        private MockMultipartFile archivo(String nombre) {
            return new MockMultipartFile("archivos", nombre, "application/epub+zip", epub(nombre));
        }

        @Test
        @DisplayName("QA BI-15: «Ya lo tengo» = subir con deseoId: hereda nota, etiquetas, estantes e ISBN y el deseo desaparece")
        void yaLoTengo() throws Exception {
            String deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Ficciones", "nota", "regalo de Samy",
                    "isbn", "9788499089515")).get("object").get("id").asText();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", deseo, "etiquetas", List.of("borges", "cuentos")));
            String estante = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Pendientes", "colorMadera", "roble"))
                    .get("object").get("id").asText();
            pedir(ANDERSON, "/v1/estantes/" + estante + "/agregar", Map.of("ejemplarId", deseo));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", deseo, "favorito", true));

            JsonNode r = subirCumpliendo(ANDERSON, deseo, archivo("ficciones.epub"));

            assertThat(r.get("correct").asBoolean()).isTrue();
            JsonNode llegado = r.get("object").get(0);
            String id = llegado.get("id").asText();
            assertThat(id).isNotEqualTo(deseo);
            assertThat(llegado.get("tipo").asText()).isEqualTo("LIBRO");
            assertThat(llegado.get("archivoId").isNull()).isFalse();
            assertThat(llegado.get("nota").asText()).isEqualTo("regalo de Samy");
            assertThat(llegado.get("etiquetas")).extracting(JsonNode::asText).containsExactly("borges", "cuentos");
            assertThat(llegado.get("isbn").asText()).isEqualTo("9788499089515");
            assertThat(llegado.get("favorito").asBoolean()).isTrue();
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + deseo).get("errorCode").asInt()).as("el deseo ya no esta")
                    .isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/estantes/" + estante + "/libros").get("object"))
                    .extracting(n -> n.get("id").asText()).containsExactly(id);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar WHERE tipo = 'DESEO'", Integer.class))
                    .isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_obra", Integer.class)).as("sin obra huerfana")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("QA BI-15: si ya tenia ese archivo, el deseo se funde con el que tenia (notas unidas, etiquetas sin repetir)")
        void yaLoTeniaDeAntes() throws Exception {
            JsonNode tenia = subirLibro(ANDERSON, "aleph.epub");
            String suyo = tenia.get("id").asText();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", suyo, "etiquetas", List.of("Borges")));
            jdbc.update("UPDATE bah_lib_ejemplar SET nota = 'mio' WHERE id = ?", UUID.fromString(suyo));
            String deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "El Aleph", "nota", "del deseo"))
                    .get("object").get("id").asText();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", deseo, "etiquetas", List.of("borges", "favoritos")));

            JsonNode r = subirCumpliendo(ANDERSON, deseo, archivo("aleph.epub"));

            JsonNode llegado = r.get("object").get(0);
            assertThat(llegado.get("id").asText()).isEqualTo(suyo);
            assertThat(llegado.get("yaLoTenias").asBoolean()).isTrue();
            assertThat(llegado.get("nota").asText()).isEqualTo("mio\n\ndel deseo");
            assertThat(llegado.get("etiquetas")).extracting(JsonNode::asText).containsExactly("Borges", "favoritos");
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + deseo).get("errorCode").asInt()).isEqualTo(102);
        }

        @Test
        @DisplayName("QA BI-15: deseoId ajeno, inexistente, que no es deseo, o con dos archivos: error claro y nada cambia")
        void yaLoTengoConErrores() throws Exception {
            String deseoDeSamy = pedir(SAMY, "/v1/libros/deseo", Map.of("titulo", "De Samy")).get("object").get("id").asText();
            assertThat(subirCumpliendo(ANDERSON, deseoDeSamy, archivo("x.epub")).get("errorCode").asInt()).isEqualTo(102);
            assertThat(subirCumpliendo(ANDERSON, UUID.randomUUID().toString(), archivo("x.epub")).get("errorCode").asInt())
                    .isEqualTo(102);

            String libro = subirLibro(ANDERSON, "y.epub").get("id").asText();
            JsonNode noDeseo = subirCumpliendo(ANDERSON, libro, archivo("x.epub"));
            assertThat(noDeseo.get("errorCode").asInt()).isEqualTo(120);
            assertThat(noDeseo.get("message").asText()).isEqualTo("Ese libro ya no está en tu lista de deseos.");

            String deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Uno")).get("object").get("id").asText();
            JsonNode dos = subirCumpliendo(ANDERSON, deseo, archivo("x.epub"), archivo("z.epub"));
            assertThat(dos.get("errorCode").asInt()).isEqualTo(120);
            assertThat(dos.get("message").asText()).isEqualTo("Para cumplir un deseo sube un solo archivo (llegaron 2).");

            JsonNode noValido = subirCumpliendo(ANDERSON, deseo,
                    new MockMultipartFile("archivos", "malo.exe", "application/octet-stream", new byte[]{1}));
            assertThat(noValido.get("correct").asBoolean()).isFalse();
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + deseo).get("object").get("tipo").asText())
                    .as("si el archivo se rechaza, el deseo sigue").isEqualTo("DESEO");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class))
                    .as("el libro y los dos deseos").isEqualTo(3);
        }
    }

    @Nested
    @DisplayName("Editar")
    class Editar {

        @Test
        @DisplayName("editar datos de la obra los marca MANUAL y limpia listas")
        void editaObra() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "a.epub");
            JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of(
                    "id", e.get("id").asText(), "titulo", "Rayuela", "autores", List.of("Cortázar", " Cortázar ", ""),
                    "anio", 1963, "editorial", "Sudamericana", "sinopsis", "Un juego", "generos", List.of("Novela"),
                    "etiquetas", List.of("argentina", "clasico")));

            JsonNode o = r.get("object");
            assertThat(o.get("titulo").asText()).isEqualTo("Rayuela");
            assertThat(o.get("autores")).hasSize(1);
            assertThat(o.get("anio").asInt()).isEqualTo(1963);
            assertThat(o.get("editorial").asText()).isEqualTo("Sudamericana");
            assertThat(o.get("sinopsis").asText()).isEqualTo("Un juego");
            assertThat(o.get("generos").get(0).asText()).isEqualTo("Novela");
            assertThat(o.get("etiquetas")).hasSize(2);
            assertThat(o.get("fuenteMetadatos").asText()).isEqualTo("MANUAL");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_cambio", Integer.class))
                    .as("el registro de cambios se escribe en otro hilo").isGreaterThanOrEqualTo(0);
        }

        @Test
        @DisplayName("estado LEYENDO pone fecha de inicio; LEIDO pone fecha de fin y cuenta una lectura")
        void estados() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEYENDO"));
            JsonNode leido = pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEIDO")).get("object");

            assertThat(leido.get("estado").asText()).isEqualTo("LEIDO");
            assertThat(leido.get("fechaFin").isNull()).isFalse();
            assertThat(jdbc.queryForObject("SELECT veces_leido FROM bah_lib_ejemplar WHERE id = ?::uuid", Integer.class, id))
                    .isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT fecha_inicio IS NOT NULL FROM bah_lib_ejemplar WHERE id = ?::uuid",
                    Boolean.class, id)).isTrue();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEIDO"));
            assertThat(jdbc.queryForObject("SELECT veces_leido FROM bah_lib_ejemplar WHERE id = ?::uuid", Integer.class, id))
                    .as("seguir en LEIDO no cuenta otra lectura").isEqualTo(1);
        }

        @Test
        @DisplayName("calificacion valida en medias estrellas; fuera de rango responde 120")
        void calificacion() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "calificacion", 4.5))
                    .get("object").get("calificacion").asDouble()).isEqualTo(4.5);
            for (double mala : new double[]{0.0, 5.5, 3.3}) {
                JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "calificacion", mala));
                assertThat(r.get("errorCode").asInt()).isEqualTo(120);
                assertThat(r.get("message").asText()).isEqualTo("La calificación va de 0,5 a 5 en pasos de media estrella.");
            }
        }

        @Test
        @DisplayName("favorito true lo pone en el estante FAVORITOS; false lo quita")
        void favorito() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "favorito", true))
                    .get("object").get("favorito").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_estante WHERE tipo = 'FAVORITOS'", Integer.class))
                    .isEqualTo(1);
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "favorito", false))
                    .get("object").get("favorito").asBoolean()).isFalse();
        }

        @Test
        @DisplayName("un id que no existe responde 102")
        void noExiste() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of("id", UUID.randomUUID().toString()));
            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(r.get("message").asText()).isEqualTo("El libro no existe o no está en tu biblioteca.");
        }
    }

    @Nested
    @DisplayName("Detalle")
    class Detalle {

        @Test
        @DisplayName("trae los capitulos de estructura.json con sus minutos y el progreso")
        void conCapitulos() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "a.epub");
            UUID archivo = uuid(e.get("archivoId"));
            escribir(DATOS.resolve("normalizados/" + archivo + "/estructura.json"), ("{\"versionFormato\":1,"
                    + "\"capitulos\":[{\"indice\":0,\"titulo\":\"Uno\",\"palabras\":3120},"
                    + "{\"indice\":1,\"titulo\":\"Dos\",\"palabras\":10}]}").getBytes(StandardCharsets.UTF_8));
            pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", e.get("id").asText(), "capitulo", 1,
                    "porcentaje", 40.0, "actualizadoEn", "2026-11-10T20:00:00Z"));

            JsonNode d = pedir(ANDERSON, "/v1/libros/get/" + e.get("id").asText()).get("object");

            assertThat(d.get("capitulos")).hasSize(2);
            assertThat(d.get("capitulos").get(0).get("titulo").asText()).isEqualTo("Uno");
            assertThat(d.get("capitulos").get(0).get("minutos").asInt()).isEqualTo(21);
            assertThat(d.get("capitulos").get(1).get("minutos").asInt()).isEqualTo(1);
            assertThat(d.get("progreso").get("capitulo").asInt()).isEqualTo(1);
            assertThat(d.get("porcentaje").asDouble()).isEqualTo(40.0);
            assertThat(d.get("estado").asText()).as("abrirlo lo pone en LEYENDO").isEqualTo("LEYENDO");
        }

        @Test
        @DisplayName("sin estructura.json (o ilegible) los capitulos llegan vacios")
        void sinEstructura() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "a.epub");
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + e.get("id").asText()).get("object").get("capitulos")).isEmpty();
            escribir(DATOS.resolve("normalizados/" + e.get("archivoId").asText() + "/estructura.json"),
                    "{roto".getBytes(StandardCharsets.UTF_8));
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + e.get("id").asText()).get("object").get("capitulos")).isEmpty();
            JsonNode deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "X")).get("object");
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + deseo.get("id").asText()).get("object").get("capitulos")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Borrar")
    class Borrar {

        @Test
        @DisplayName("el ultimo ejemplar de un archivo se lleva el archivo, su cola, su audio y sus ficheros; la obra se queda con el retirado (BI-01)")
        void ultimoEjemplar() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "a.epub");
            UUID archivo = uuid(e.get("archivoId"));
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado) VALUES (?, 'v', 0, 'LISTO')", archivo);
            Path normalizado = escribir(DATOS.resolve("normalizados/" + archivo + "/libro.epub"), epub("n"));

            JsonNode r = pedir(ANDERSON, "/v1/libros/delete/" + e.get("id").asText());

            assertThat(r.get("object").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_audio", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_obra", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar WHERE retirado_en IS NOT NULL AND archivo_id IS NULL",
                    Integer.class)).isEqualTo(1);
            assertThat(Files.exists(normalizado)).isFalse();
            assertThat(Files.exists(DATOS.resolve("originales/" + archivo))).isFalse();
        }

        @Test
        @DisplayName("si otro usuario tiene el mismo archivo, el archivo se queda")
        void otroLoUsa() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "a.epub");
            subir(SAMY, "a.epub", epub("a.epub"));

            pedir(ANDERSON, "/v1/libros/delete/" + a.get("id").asText());

            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isEqualTo(1);
            assertThat(Files.exists(DATOS.resolve("originales/" + a.get("archivoId").asText()))).isTrue();
        }

        @Test
        @DisplayName("borrar con /datos desmontado borra en la base y deja los ficheros (con log)")
        void sinDatos() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "a.epub");
            borrar(DATOS);
            JsonNode r = pedir(ANDERSON, "/v1/libros/delete/" + a.get("id").asText());
            Files.createDirectories(DATOS);
            assertThat(r.get("object").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isZero();
        }
    }
}
