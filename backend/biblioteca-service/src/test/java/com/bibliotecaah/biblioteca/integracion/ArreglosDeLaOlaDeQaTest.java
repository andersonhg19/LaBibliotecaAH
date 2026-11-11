package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.config.Topes;
import com.bibliotecaah.biblioteca.service.impl.TareaLimpieza;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Regresiones de los informes de QA (2026-11-11) cuya causa estaba en
 * biblioteca-service. Cada @Nested nombra el hallazgo que cierra.
 */
@DisplayName("Arreglos de la ola de QA en biblioteca-service")
class ArreglosDeLaOlaDeQaTest extends PostgresDeVerdad {

    private static final String VOZ = "edge.es-ES-AlvaroNeural";

    @Autowired private Topes topes;
    @Autowired private TareaLimpieza limpieza;

    @AfterEach
    void restaurarTopes() {
        topes.setArchivosPorSubida(20);
        topes.setEspacioLibreMinimoBytes(1024L * 1024 * 1024);
        topes.setEstantesPorUsuario(100);
    }

    private int contar(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    /** Lanza las tareas a la vez (todas esperan a una salida comun) y devuelve sus resultados. */
    private <T> List<T> aLaVez(List<Callable<T>> tareas) throws Exception {
        ExecutorService hilos = Executors.newFixedThreadPool(tareas.size());
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<T>> futuros = new ArrayList<>();
            for (Callable<T> t : tareas) {
                futuros.add(hilos.submit(() -> {
                    salida.await();
                    return t.call();
                }));
            }
            salida.countDown();
            List<T> resultados = new ArrayList<>();
            for (Future<T> f : futuros) resultados.add(f.get());
            return resultados;
        } finally {
            hilos.shutdownNow();
        }
    }

    // ===================================================================== BI-01

    @Nested
    @DisplayName("BI-01: retirar un libro conserva lo escrito y vuelve al subirlo otra vez")
    class Retirar {

        @Test
        @DisplayName("notas, diario, progreso, calificacion, favorito y datos editados reaparecen en el mismo ejemplar")
        void conservaYReaparece() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "cronica.epub");
            String id = e.get("id").asText();
            UUID archivo = uuid(e.get("archivoId"));
            pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", id, "tipo", "NOTA", "nota", "clave"));
            pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", id, "texto", "lo empece hoy"));
            pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "capitulo", 2, "porcentaje", 42.0));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "titulo", "Crónica", "calificacion", 4.5, "favorito", true));

            assertThat(pedir(ANDERSON, "/v1/libros/delete/" + id).get("object").asBoolean()).isTrue();

            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of()).get("object").get("totalElements").asInt()).isZero();
            assertThat(pedir(ANDERSON, "/v1/libros/get/" + id).get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/estantes/all").get("object").get(0).get("nLibros").asInt())
                    .as("favoritos no cuenta el retirado").isZero();
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_archivo")).as("nadie mas lo usaba").isZero();
            assertThat(Files.exists(DATOS.resolve("originales/" + archivo))).isFalse();
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_anotacion")).isEqualTo(1);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_comentario")).isEqualTo(1);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_progreso")).isEqualTo(1);

            JsonNode vuelve = subir(ANDERSON, "otro-nombre.epub", epub("cronica.epub")).get("object").get(0);

            assertThat(vuelve.get("id").asText()).isEqualTo(id);
            assertThat(vuelve.get("titulo").asText()).isEqualTo("Crónica");
            assertThat(vuelve.get("calificacion").asDouble()).isEqualTo(4.5);
            assertThat(vuelve.get("favorito").asBoolean()).isTrue();
            assertThat(vuelve.get("nNotas").asInt()).isEqualTo(1);
            assertThat(vuelve.get("porcentaje").asDouble()).isEqualTo(42.0);
            assertThat(vuelve.get("yaLoTenias").asBoolean()).isFalse();
            assertThat(pedir(ANDERSON, "/v1/comentarios/all/" + id).get("object")).hasSize(1);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar")).isEqualTo(1);
        }

        @Test
        @DisplayName("si otro usuario tiene el archivo, se queda; el retirado no se puede editar ni servir")
        void compartido() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "a.epub");
            subir(SAMY, "a.epub", epub("a.epub"));
            pedir(ANDERSON, "/v1/libros/delete/" + a.get("id").asText());

            assertThat(contar("SELECT COUNT(*) FROM bah_lib_archivo")).isEqualTo(1);
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", a.get("id").asText(), "titulo", "x"))
                    .get("errorCode").asInt()).isEqualTo(102);
            int estado = mvc.perform(get("/biblioteca/v1/archivos/" + a.get("archivoId").asText() + "/original")
                    .contextPath("/biblioteca").header("Authorization", bearer(ANDERSON))).andReturn().getResponse().getStatus();
            assertThat(estado).isEqualTo(404);
        }

        @Test
        @DisplayName("un deseo se borra de verdad (no hay archivo con que reencontrarlo)")
        void deseo() throws Exception {
            String id = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Ficciones")).get("object").get("id").asText();
            pedir(ANDERSON, "/v1/libros/delete/" + id);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar")).isZero();
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_obra")).isZero();
        }
    }

    // ============================================================= DA-14/DA-28

    @Nested
    @DisplayName("DA-14/DA-28: retirar el ultimo ejemplar cancela la cola y limpia lo que el taller deje tarde")
    class Limpieza {

        @Test
        @DisplayName("se borran trabajos pendientes y en curso y el audio; la tarea recoge filas y carpetas huerfanas viejas")
        void recogeRestos() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "a.epub");
            UUID archivo = uuid(e.get("archivoId"));
            jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, estado) VALUES (?, 'VOZ_CAPITULO', ?, 'EN_CURSO')",
                    UUID.randomUUID(), archivo);
            pedir(ANDERSON, "/v1/libros/delete/" + e.get("id").asText());
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo")).isZero();

            // El taller termina tarde: UPSERT de audio y ficheros de un archivo que ya no existe.
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado) VALUES (?, ?, 2, 'LISTO')", archivo, VOZ);
            Path viejo = escribir(DATOS.resolve("audio/" + archivo + "/" + VOZ + "/cap-002.m4a"), new byte[]{1});
            Path reciente = escribir(DATOS.resolve("normalizados/" + UUID.randomUUID() + "/libro.epub"), new byte[]{1});
            Path ajeno = escribir(DATOS.resolve("audio/no-es-un-uuid/x.m4a"), new byte[]{1});
            JsonNode vivo = subirLibro(SAMY, "vivo.epub");
            Path deUnArchivoVivo = DATOS.resolve("originales/" + vivo.get("archivoId").asText());
            FileTime haceUnDia = FileTime.from(Instant.now().minus(1, ChronoUnit.DAYS));
            Files.setLastModifiedTime(DATOS.resolve("audio/" + archivo), haceUnDia);
            Files.setLastModifiedTime(deUnArchivoVivo, haceUnDia);
            Files.setLastModifiedTime(DATOS.resolve("audio/no-es-un-uuid"), haceUnDia);

            assertThat(limpieza.limpiar()).isEqualTo(2);

            assertThat(contar("SELECT COUNT(*) FROM bah_lib_audio")).isZero();
            assertThat(Files.exists(viejo)).isFalse();
            assertThat(Files.exists(reciente)).as("menos de 6 h: puede ser una subida en curso").isTrue();
            assertThat(Files.exists(ajeno)).as("solo carpetas con nombre de UUID").isTrue();
            assertThat(Files.exists(deUnArchivoVivo)).isTrue();
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo")).as("la conversion de Samy sigue").isEqualTo(1);
        }
    }

    // ===================================================================== DA-13

    @Nested
    @DisplayName("DA-13: el mismo archivo subido a la vez")
    class SubidaSimultanea {

        @Test
        @DisplayName("por dos usuarios: los dos reciben su ejemplar del mismo archivo y no quedan carpetas huerfanas")
        void dosUsuarios() throws Exception {
            for (int ronda = 0; ronda < 3; ronda++) {
                limpiarTodo();
                byte[] bytes = epub("carrera-" + ronda);
                List<JsonNode> r = aLaVez(List.of(
                        () -> subir(ANDERSON, "carrera.epub", bytes),
                        () -> subir(SAMY, "carrera.epub", bytes)));

                for (JsonNode x : r) {
                    assertThat(x.get("correct").asBoolean()).as(x.toString()).isTrue();
                }
                assertThat(r.get(0).get("object").get(0).get("archivoId").asText())
                        .isEqualTo(r.get(1).get("object").get(0).get("archivoId").asText());
                assertThat(contar("SELECT COUNT(*) FROM bah_lib_archivo")).isEqualTo(1);
                assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar")).isEqualTo(2);
                try (Stream<Path> carpetas = Files.list(DATOS.resolve("originales"))) {
                    assertThat(carpetas.count()).as("una sola carpeta en originales").isEqualTo(1);
                }
                try (Stream<Path> tmp = Files.list(DATOS.resolve("tmp"))) {
                    assertThat(tmp.count()).as("sin temporales").isZero();
                }
            }
        }

        @Test
        @DisplayName("por el mismo usuario dos veces (doble envio): un solo ejemplar, el segundo marcado yaLoTenias")
        void mismoUsuario() throws Exception {
            byte[] bytes = epub("doble");
            List<JsonNode> r = aLaVez(List.of(
                    () -> subir(ANDERSON, "doble.epub", bytes),
                    () -> subir(ANDERSON, "doble.epub", bytes)));

            assertThat(r).allMatch(x -> x.get("correct").asBoolean());
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar")).isEqualTo(1);
            assertThat(r.stream().filter(x -> x.get("object").get(0).get("yaLoTenias").asBoolean()).count()).isEqualTo(1);
        }
    }

    // ============================================================ BI-16, BI-21

    @Nested
    @DisplayName("BI-16 y BI-21: avisos de la subida")
    class AvisosDeSubida {

        @Test
        @DisplayName("subir algo que ya tienes lo dice en el mensaje y en yaLoTenias")
        void yaLoTenias() throws Exception {
            subirLibro(ANDERSON, "cien.epub");
            JsonNode r = subir(ANDERSON, "LIBRO",
                    new MockMultipartFile("archivos", "cien.epub", "application/epub+zip", epub("cien.epub")),
                    new MockMultipartFile("archivos", "nuevo.epub", "application/epub+zip", epub("nuevo")));

            assertThat(r.get("message").asText()).isEqualTo("Ya tenías en tu biblioteca: \"cien.epub\".");
            assertThat(r.get("object").get(0).get("yaLoTenias").asBoolean()).isTrue();
            assertThat(r.get("object").get(1).get("yaLoTenias").asBoolean()).isFalse();
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of()).get("object").get("list").get(0).has("yaLoTenias"))
                    .as("fuera de la subida no aparece").isFalse();
        }

        @Test
        @DisplayName("DA-15: un TXT en UTF-16 con o sin marca (Bloc de notas 'Unicode') se acepta; un binario con ceros, no")
        void utf16() throws Exception {
            byte[] conMarca = ("﻿Capítulo 1").getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
            assertThat(subir(ANDERSON, "unicode.txt", conMarca).get("correct").asBoolean()).isTrue();
            byte[] sinMarcaLe = "Capítulo 1. Érase una vez".getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
            assertThat(subir(ANDERSON, "sin-marca-le.txt", sinMarcaLe).get("correct").asBoolean()).isTrue();
            byte[] sinMarcaBe = "Capítulo 2. Érase otra vez".getBytes(java.nio.charset.StandardCharsets.UTF_16BE);
            assertThat(subir(ANDERSON, "sin-marca-be.txt", sinMarcaBe).get("correct").asBoolean()).isTrue();
            byte[] binario = {65, 0, 0, 66, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14};
            assertThat(subir(ANDERSON, "binario.txt", binario).get("message").asText())
                    .isEqualTo("No se pudo agregar ningún archivo: \"binario.txt\": no parece un TXT válido "
                            + "(el contenido no coincide con la extensión).");
        }

        @Test
        @DisplayName("un archivo vacio dice que esta vacio, no que no llego nada")
        void vacio() throws Exception {
            JsonNode r = subir(ANDERSON, "vacio.txt", new byte[0]);
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText())
                    .isEqualTo("No se pudo agregar ningún archivo: \"vacio.txt\": el archivo está vacío.");
        }
    }

    // ===================================================================== SE-07

    @Nested
    @DisplayName("SE-07: topes")
    class TopesDeEntrada {

        @Test
        @DisplayName("mas archivos por peticion que el tope: 413 sin guardar nada")
        void archivosPorPeticion() throws Exception {
            topes.setArchivosPorSubida(2);
            JsonNode r = subir(ANDERSON, "LIBRO",
                    new MockMultipartFile("archivos", "a.txt", "text/plain", "a".getBytes(StandardCharsets.UTF_8)),
                    new MockMultipartFile("archivos", "b.txt", "text/plain", "b".getBytes(StandardCharsets.UTF_8)),
                    new MockMultipartFile("archivos", "c.txt", "text/plain", "c".getBytes(StandardCharsets.UTF_8)));

            assertThat(r.get("errorCode").asInt()).isEqualTo(413);
            assertThat(r.get("message").asText())
                    .isEqualTo("Puedes subir hasta 2 archivos a la vez y llegaron 3. Súbelos en tandas.");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar")).isZero();
        }

        @Test
        @DisplayName("sin espacio libre suficiente en /datos: 507 sin guardar nada")
        void sinEspacio() throws Exception {
            topes.setEspacioLibreMinimoBytes(Long.MAX_VALUE / 2);
            JsonNode r = subir(ANDERSON, "a.epub", epub("a"));

            assertThat(r.get("errorCode").asInt()).isEqualTo(507);
            assertThat(r.get("message").asText()).isEqualTo("No queda espacio suficiente en el disco de la biblioteca "
                    + "para esta subida. Avísale a quien administra la biblioteca.");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_archivo")).isZero();
        }

        @Test
        @DisplayName("tope de colecciones por usuario (Favoritos no cuenta)")
        void estantes() throws Exception {
            topes.setEstantesPorUsuario(2);
            pedir(ANDERSON, "/v1/estantes/all");
            pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Uno"));
            pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Dos"));
            JsonNode r = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Tres"));

            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("Ya tienes 2 estantes, el máximo. Borra alguno antes de crear otro.");
        }

        @Test
        @DisplayName("textos y listas con tope: nota, deseo, etiquetas, sinopsis, frase y dispositivo (SE-12, BI-25)")
        void textos() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            List<String> muchas = new ArrayList<>();
            for (int i = 0; i < 51; i++) muchas.add("e" + i);

            assertThat(pedir(ANDERSON, "/v1/anotaciones/save",
                    Map.of("ejemplarId", id, "tipo", "NOTA", "nota", "x".repeat(10_001))).get("message").asText())
                    .isEqualTo("Revisa los datos enviados: nota no puede superar los 10000 caracteres.");
            assertThat(pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "x", "nota", "x".repeat(2001)))
                    .get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "etiquetas", muchas)).get("message").asText())
                    .isEqualTo("Revisa los datos enviados: etiquetas no puede tener más de 50 elementos.");
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "sinopsis", "x".repeat(10_001)))
                    .get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "fraseId", "c".repeat(21)))
                    .get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "dispositivo", "d".repeat(101)))
                    .get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", id, "tipo", "RESALTADO",
                    "color", "c".repeat(31))).get("errorCode").asInt()).isEqualTo(120);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_anotacion")).isZero();
        }

        @Test
        @DisplayName("el anio se valida en el servidor y no se trunca (BI-18)")
        void anio() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "anio", 99999)).get("message").asText())
                    .isEqualTo("Revisa los datos enviados: anio debe estar entre -3000 y 2100.");
            assertThat(pedir(ANDERSON, "/v1/libros/save", "{\"id\":\"" + id + "\",\"anio\":1999.5}")
                    .get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "anio", -800)).get("object").get("anio").asInt())
                    .isEqualTo(-800);
        }
    }

    // ============================================================= BI-07, BI-08

    @Nested
    @DisplayName("BI-07/BI-08: null explicito vacia, campo ausente no toca")
    class CamposVaciables {

        @Test
        @DisplayName("quitar la calificacion y vaciar anio, editorial, sinopsis y generos")
        void vaciar() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "calificacion", 3.0, "anio", 1949,
                    "editorial", "Sur", "sinopsis", "s", "generos", List.of("Novela")));

            JsonNode sinTocar = pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEYENDO")).get("object");
            assertThat(sinTocar.get("calificacion").asDouble()).isEqualTo(3.0);
            assertThat(sinTocar.get("anio").asInt()).isEqualTo(1949);

            Map<String, Object> nulos = new HashMap<>();
            nulos.put("id", id);
            for (String campo : List.of("calificacion", "anio", "editorial", "sinopsis", "generos", "titulo")) {
                nulos.put(campo, null);
            }
            JsonNode o = pedir(ANDERSON, "/v1/libros/save", nulos).get("object");

            assertThat(o.get("calificacion").isNull()).isTrue();
            assertThat(o.get("anio").isNull()).isTrue();
            assertThat(o.get("editorial").isNull()).isTrue();
            assertThat(o.get("sinopsis").isNull()).isTrue();
            assertThat(o.get("generos")).isEmpty();
            assertThat(o.get("titulo").asText()).as("el titulo no se vacia").isEqualTo("a");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_ejemplar WHERE calificacion IS NULL")).isEqualTo(1);
        }

        @Test
        @DisplayName("BI-27: volver de Leido a Por leer o Leyendo limpia la fecha de fin; las lecturas se conservan")
        void fechaFin() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEIDO")).get("object")
                    .get("fechaFin").isNull()).isFalse();
            JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "estado", "LEYENDO")).get("object");
            assertThat(r.get("fechaFin").isNull()).isTrue();
            assertThat(contar("SELECT veces_leido FROM bah_lib_ejemplar WHERE id = ?::uuid", id)).isEqualTo(1);
        }

        @Test
        @DisplayName("BI-15: el deseo trae su nota")
        void notaDelDeseo() throws Exception {
            JsonNode d = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "El Aleph", "nota", "regalo")).get("object");
            assertThat(d.get("nota").asText()).isEqualTo("regalo");
        }
    }

    // ============================================================== BI-09/BI-10

    @Nested
    @DisplayName("BI-09/BI-10: dobles peticiones sin error ni duplicados")
    class Idempotencia {

        @Test
        @DisplayName("cinco favoritos y cuatro 'agregar a coleccion' a la vez: todo correcto y una sola fila")
        void favoritoYColeccion() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            String coleccion = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Club")).get("object").get("id").asText();
            List<Callable<JsonNode>> tareas = new ArrayList<>();
            for (int i = 0; i < 5; i++) tareas.add(() -> pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "favorito", true)));
            for (int i = 0; i < 4; i++) {
                tareas.add(() -> pedir(ANDERSON, "/v1/estantes/" + coleccion + "/agregar", Map.of("ejemplarId", id)));
            }

            List<JsonNode> r = aLaVez(tareas);

            assertThat(r).allMatch(x -> x.get("correct").asBoolean());
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_estante WHERE tipo = 'FAVORITOS'")).isEqualTo(1);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_estante_item")).isEqualTo(2);

            List<JsonNode> quitar = aLaVez(List.of(
                    () -> pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "favorito", false)),
                    () -> pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "favorito", false)),
                    () -> pedir(ANDERSON, "/v1/estantes/" + coleccion + "/quitar", Map.of("ejemplarId", id)),
                    () -> pedir(ANDERSON, "/v1/estantes/" + coleccion + "/quitar", Map.of("ejemplarId", id))));
            assertThat(quitar).allMatch(x -> x.get("correct").asBoolean());
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_estante_item")).isZero();
        }

        @Test
        @DisplayName("tres 'Anotar en el diario' iguales a la vez dejan una entrada; un texto distinto si entra")
        void diario() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            List<Callable<JsonNode>> tareas = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                tareas.add(() -> pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", id, "texto", "  hoy  ")));
            }
            List<JsonNode> r = aLaVez(tareas);

            assertThat(r).allMatch(x -> x.get("correct").asBoolean());
            assertThat(r.stream().map(x -> x.get("object").get("id").asText()).distinct()).hasSize(1);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_comentario")).isEqualTo(1);
            pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", id, "texto", "otra cosa"));
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_comentario")).isEqualTo(2);
        }

        @Test
        @DisplayName("la misma anotacion dos veces seguidas no se duplica; otra posicion si")
        void anotacion() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            Map<String, Object> resaltado = Map.of("ejemplarId", id, "tipo", "RESALTADO", "fraseInicio", "c000-s00001",
                    "offsetInicio", 0, "fraseFin", "c000-s00001", "offsetFin", 9, "color", "amarillo");
            List<JsonNode> r = aLaVez(List.of(() -> pedir(ANDERSON, "/v1/anotaciones/save", resaltado),
                    () -> pedir(ANDERSON, "/v1/anotaciones/save", resaltado)));

            assertThat(r.get(0).get("object").get("id").asText()).isEqualTo(r.get(1).get("object").get("id").asText());
            Map<String, Object> otra = new HashMap<>(resaltado);
            otra.put("offsetFin", 12);
            pedir(ANDERSON, "/v1/anotaciones/save", otra);
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_anotacion")).isEqualTo(2);
        }
    }

    // ============================================================ BI-12, BI-13

    @Nested
    @DisplayName("BI-12/BI-13/BI-23: pestanas solo de libros y facetas coherentes")
    class PestanasYFacetas {

        @Test
        @DisplayName("documentos y deseos fuera de Todo/Por leer; la cuenta de cada faceta es lo que da su filtro")
        void coherentes() throws Exception {
            String libro = subirLibro(ANDERSON, "a.epub").get("id").asText();
            String libro2 = subirLibro(ANDERSON, "b.epub").get("id").asText();
            String doc = subir(ANDERSON, "DOCUMENTO", new MockMultipartFile("archivos", "doc.pdf", "application/pdf", pdf("d")))
                    .get("object").get(0).get("id").asText();
            pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "D", "autor", "Gabo"));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", libro, "autores", List.of("Gabo"), "generos", List.of("Novela")));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", libro2, "autores", List.of("Gabo"), "generos", List.of("novela")));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", doc, "autores", List.of("Gabo")));

            for (String pestana : List.of("TODO", "POR_LEER")) {
                assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of("pestana", pestana)).get("object").get("totalElements").asInt())
                        .as(pestana).isEqualTo(2);
            }
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of("pestana", "DOCUMENTOS")).get("object").get("totalElements").asInt())
                    .isEqualTo(1);

            JsonNode facetas = pedir(ANDERSON, "/v1/libros/facetas").get("object");
            assertThat(facetas.get("autores")).hasSize(1);
            assertThat(facetas.get("autores").get(0).get("n").asInt()).isEqualTo(2);
            assertThat(facetas.get("generos")).hasSize(1);
            assertThat(facetas.get("generos").get(0).get("nombre").asText()).isEqualTo("Novela");
            assertThat(facetas.get("generos").get(0).get("n").asInt()).isEqualTo(2);
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of("generos", List.of("NOVELA"))).get("object")
                    .get("totalElements").asInt()).as("el filtro de genero no distingue mayusculas").isEqualTo(2);
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of("autores", List.of("Gabo"))).get("object")
                    .get("totalElements").asInt()).isEqualTo(facetas.get("autores").get(0).get("n").asInt());

            JsonNode deseos = pedir(ANDERSON, "/v1/libros/facetas", Map.of("pestana", "DESEOS")).get("object");
            assertThat(deseos.get("autores").get(0).get("n").asInt()).isEqualTo(1);
            assertThat(pedir(ANDERSON, "/v1/libros/facetas", Map.of("pestana", "DOCUMENTOS")).get("object")
                    .get("formatos").get(0).get("nombre").asText()).isEqualTo("PDF");
        }

        @Test
        @DisplayName("un genero repetido con otra mayuscula en el mismo libro se guarda una vez")
        void generoRepetido() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            JsonNode o = pedir(ANDERSON, "/v1/libros/save", Map.of("id", id, "generos", List.of("Novela", " novela ", "Cuento")))
                    .get("object");
            assertThat(o.get("generos")).extracting(JsonNode::asText).containsExactly("Novela", "Cuento");
        }
    }

    // ======================================================== SE-06, DA-01, DA-02

    @Nested
    @DisplayName("SE-06/DA-01/DA-02: voz del catalogo, errores informados y reintentos explicitos")
    class Voz {

        private String ejemplar;
        private UUID archivo;

        private JsonNode estado(String voz, int capitulo, Boolean reintentar) throws Exception {
            Map<String, Object> p = new HashMap<>(Map.of("ejemplarId", ejemplar, "vozId", voz, "capitulo", capitulo));
            if (reintentar != null) p.put("reintentar", reintentar);
            return pedir(ANDERSON, "/v1/audio/estado", p);
        }

        private void libroListo() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "voz.epub");
            ejemplar = e.get("id").asText();
            archivo = uuid(e.get("archivoId"));
            marcarListo(archivo, 1, "{}");
        }

        @Test
        @DisplayName("una voz que no esta en el catalogo responde 120 y no encola nada")
        void vozDelCatalogo() throws Exception {
            libroListo();
            for (String falsa : List.of("edge.qa-seg-falsa-1", "piper.x", "edge.es-ES-NoExisteNeural")) {
                JsonNode r = estado(falsa, 0, null);
                assertThat(r.get("errorCode").asInt()).isEqualTo(120);
                assertThat(r.get("message").asText())
                        .isEqualTo("La voz \"" + falsa + "\" no está en el catálogo. Elige una de la lista de voces.");
            }
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'")).isZero();
        }

        @Test
        @DisplayName("ERROR se informa con su motivo y solo se reintenta con reintentar=true")
        void errorYReintento() throws Exception {
            libroListo();
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, error) VALUES (?, ?, 0, 'ERROR', 'sin texto')",
                    archivo, VOZ);
            for (int i = 0; i < 3; i++) {
                JsonNode r = estado(VOZ, 0, i == 2 ? false : null).get("object");
                assertThat(r.get("estado").asText()).isEqualTo("ERROR");
                assertThat(r.get("error").asText()).isEqualTo("sin texto");
            }
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'")).isZero();

            JsonNode otra = estado(VOZ, 0, true).get("object");
            assertThat(otra.get("estado").asText()).isEqualTo("PENDIENTE");
            assertThat(otra.get("error").isNull()).isTrue();
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' AND prioridad = 10")).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT estado FROM bah_lib_audio WHERE archivo_id = ?", String.class, archivo))
                    .isEqualTo("PENDIENTE");
            assertThat(estado(VOZ, 0, true).get("object").get("estado").asText()).as("sin duplicar").isEqualTo("PENDIENTE");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'")).isEqualTo(1);
        }

        @Test
        @DisplayName("un GENERANDO o EN_CURSO sin latido en 10 min (taller reiniciado) se vuelve a encolar")
        void atascado() throws Exception {
            libroListo();
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, actualizado) "
                    + "VALUES (?, ?, 0, 'GENERANDO', now() - interval '45 minutes')", archivo, VOZ);
            jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, estado, actualizado) VALUES (?, "
                    + "'VOZ_CAPITULO', ?, jsonb_build_object('vozId', ?::text, 'capitulo', 0), 'EN_CURSO', now() - interval '45 minutes')",
                    UUID.randomUUID(), archivo, VOZ);

            assertThat(estado(VOZ, 0, null).get("object").get("estado").asText()).isEqualTo("PENDIENTE");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' AND estado = 'PENDIENTE'")).isEqualTo(1);

            jdbc.update("UPDATE bah_lib_audio SET actualizado = now()");
            jdbc.update("DELETE FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' AND estado = 'PENDIENTE'");
            assertThat(estado(VOZ, 0, null).get("object").get("estado").asText()).isEqualTo("GENERANDO");
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' AND estado = 'PENDIENTE'")).isZero();
        }
    }

    // ============================================================ SE-13, BI-05

    @Nested
    @DisplayName("SE-13/BI-05: progreso con reloj adelantado y numeros raros")
    class Progreso {

        @Test
        @DisplayName("una fecha en el futuro se guarda con la hora del servidor y no bloquea al otro dispositivo")
        void futuro() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            Instant antes = Instant.now();
            JsonNode iphone = pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "porcentaje", 30.0,
                    "actualizadoEn", "9999-12-31T00:00:00Z")).get("object");
            Instant guardada = Instant.parse(iphone.get("actualizadoEn").asText());
            assertThat(guardada).isBetween(antes.minusSeconds(1), Instant.now().plusSeconds(1));

            JsonNode pc = pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "porcentaje", 55.0,
                    "actualizadoEn", Instant.now().plusSeconds(1).toString()));
            assertThat(pc.get("message").asText()).isEqualTo("OK");
            assertThat(pc.get("object").get("porcentaje").asDouble()).isEqualTo(55.0);
        }

        @Test
        @DisplayName("un progreso que quedo congelado en el futuro (datos viejos) se puede volver a guardar")
        void descongela() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "porcentaje", 1.0));
            jdbc.update("UPDATE bah_lib_progreso SET actualizado_en = '9999-12-31T00:00:00Z'");

            JsonNode r = pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", id, "porcentaje", 2.0));
            assertThat(r.get("message").asText()).isEqualTo("OK");
            assertThat(r.get("object").get("porcentaje").asDouble()).isEqualTo(2.0);
        }

        @Test
        @DisplayName("NaN, Infinity y valores fuera de rango responden 120 y no se guardan")
        void noFinitos() throws Exception {
            String id = subirLibro(ANDERSON, "a.epub").get("id").asText();
            Map<String, String> casos = Map.of(
                    "{\"ejemplarId\":\"" + id + "\",\"porcentaje\":\"NaN\"}", "El campo \"porcentaje\" debe ser un número entre 0 y 100.",
                    "{\"ejemplarId\":\"" + id + "\",\"velocidad\":\"Infinity\"}", "El campo \"velocidad\" debe ser un número entre 0.25 y 5.",
                    "{\"ejemplarId\":\"" + id + "\",\"posicionAudioSeg\":-1}", "El campo \"posicionAudioSeg\" debe ser un número entre 0 y 10000000.");
            for (Map.Entry<String, String> c : casos.entrySet()) {
                JsonNode r = pedir(ANDERSON, "/v1/progreso/save", c.getKey());
                assertThat(r.get("errorCode").asInt()).as(c.getKey()).isEqualTo(120);
                assertThat(r.get("message").asText()).isEqualTo(c.getValue());
            }
            assertThat(contar("SELECT COUNT(*) FROM bah_lib_progreso")).isZero();
        }
    }

    // ===================================================================== SE-14, SE-16, SE-18

    @Nested
    @DisplayName("SE-14/SE-16/SE-18: nombre de descarga, tipo de contenido y claims obligatorios")
    class Varios {

        @Test
        @DisplayName("el original se descarga con el titulo de TU ejemplar, no con el nombre de quien lo subio")
        void nombreNeutro() throws Exception {
            subir(ANDERSON, "xss-de-anderson.epub", epub("comun"));
            JsonNode deSamy = subir(SAMY, "OTRO-NOMBRE.epub", epub("comun")).get("object").get(0);
            pedir(SAMY, "/v1/libros/save", Map.of("id", deSamy.get("id").asText(), "titulo", "Mi copia"));

            String disposicion = mvc.perform(get("/biblioteca/v1/archivos/" + deSamy.get("archivoId").asText() + "/original")
                            .contextPath("/biblioteca").header("Authorization", bearer(SAMY)))
                    .andReturn().getResponse().getHeader("Content-Disposition");
            assertThat(disposicion).contains("Mi_copia.epub").doesNotContain("anderson");
        }

        @Test
        @DisplayName("un cuerpo XML responde 120 con mensaje, no 103")
        void xml() throws Exception {
            String r = mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca")
                            .header("Authorization", bearer(ANDERSON)).contentType(MediaType.APPLICATION_XML).content("<a/>"))
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
            JsonNode n = json.readTree(r);
            assertThat(n.get("errorCode").asInt()).isEqualTo(120);
            assertThat(n.get("message").asText()).isEqualTo("La petición debe enviarse como JSON (Content-Type: application/json).");
        }

        @Test
        @DisplayName("un token sin exp o sin userId responde 401")
        void claims() throws Exception {
            String sinExp = com.auth0.jwt.JWT.create().withSubject("x").withClaim("userId", ANDERSON)
                    .sign(com.auth0.jwt.algorithms.Algorithm.HMAC256(SECRETO));
            String sinUsuario = com.auth0.jwt.JWT.create().withSubject("x")
                    .withExpiresAt(new java.util.Date(System.currentTimeMillis() + 60_000))
                    .sign(com.auth0.jwt.algorithms.Algorithm.HMAC256(SECRETO));
            for (String t : List.of(sinExp, sinUsuario)) {
                int estado = mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca")
                        .header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON).content("{}"))
                        .andReturn().getResponse().getStatus();
                assertThat(estado).isEqualTo(401);
            }
        }
    }
}
