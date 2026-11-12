package com.bibliotecaah.biblioteca.integracion;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.service.impl.TareaMetadatos;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@DisplayName("Generos desde las materias del archivo (v1.4)")
class GenerosTest extends PostgresDeVerdad {

    private static final String MATERIAS = "{\"titulo\":\"El libro\",\"autores\":[\"Ana\"],"
            + "\"materias\":[\"Novela\",\"Fantástico\",\"Juvenil\"]}";
    private static final String RUTA_RELLENO = "/v1/admin/libros/rellenar-generos";

    @Autowired private TareaMetadatos metadatos;

    private JsonNode libro(long usuario, JsonNode ejemplar) throws Exception {
        return pedir(usuario, "/v1/libros/get/" + ejemplar.get("id").asText()).get("object");
    }

    private static List<String> textos(JsonNode lista) {
        return java.util.stream.StreamSupport.stream(lista.spliterator(), false).map(JsonNode::asText).toList();
    }

    private int trabajosDeRelectura() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'RELEER_METADATOS'",
                Integer.class);
    }

    /** Lo que hace el taller con RELEER_METADATOS (contratos v1.4 §7). */
    private void tallerReleeMaterias(UUID archivo, String materiasJson) {
        jdbc.update("UPDATE bah_lib_archivo SET metadatos = COALESCE(metadatos, '{}'::jsonb) "
                + "|| jsonb_build_object('materias', CAST(? AS jsonb)), metadatos_aplicados = FALSE "
                + "WHERE id = ? AND estado_conversion = 'LISTO'", materiasJson, archivo);
        jdbc.update("UPDATE bah_lib_trabajo SET estado = 'HECHO' WHERE archivo_id = ? AND tipo = 'RELEER_METADATOS'",
                archivo);
    }

    private JsonNode comoAdmin(String ruta) throws Exception {
        String token = JWT.create().withSubject("admin@biblioteca.ah").withClaim("userId", 9L)
                .withArrayClaim("roles", new String[]{"USER", "ADMIN"})
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256(SECRETO));
        MvcResult r = mvc.perform(post("/biblioteca" + ruta).contextPath("/biblioteca")
                .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Nested
    @DisplayName("Al convertir")
    class AlConvertir {

        @Test
        @DisplayName("un archivo LISTO con materias rellena generos canonicos y etiquetas de forma y publico")
        void rellena() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            marcarListo(uuid(a.get("archivoId")), 3, MATERIAS);

            metadatos.revisar();

            JsonNode de = libro(ANDERSON, a);
            assertThat(textos(de.get("generos"))).containsExactly("Fantasía");
            assertThat(textos(de.get("etiquetas"))).containsExactly("Novela", "Juvenil");
            JsonNode facetas = pedir(ANDERSON, "/v1/libros/facetas", Map.of()).get("object");
            assertThat(facetas.get("generos").get(0).get("nombre").asText()).isEqualTo("Fantasía");
        }

        @Test
        @DisplayName("no pisa los generos del usuario (MANUAL) y rellena los de una obra MANUAL sin generos")
        void noPisa() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            JsonNode s = subir(SAMY, "libro.epub", epub("libro.epub")).get("object").get(0);
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", a.get("id").asText(), "generos", List.of("Clásicos"),
                    "etiquetas", List.of("novela", "mía")));
            pedir(SAMY, "/v1/libros/save", Map.of("id", s.get("id").asText(), "titulo", "Mi titulo",
                    "etiquetas", List.of("juvenil")));
            marcarListo(uuid(a.get("archivoId")), 3, MATERIAS);

            metadatos.revisar();

            JsonNode deAnderson = libro(ANDERSON, a);
            assertThat(textos(deAnderson.get("generos"))).containsExactly("Clásicos");
            assertThat(textos(deAnderson.get("etiquetas"))).containsExactly("novela", "mía");
            JsonNode deSamy = libro(SAMY, s);
            assertThat(deSamy.get("titulo").asText()).isEqualTo("Mi titulo");
            assertThat(textos(deSamy.get("generos"))).containsExactly("Fantasía");
            assertThat(textos(deSamy.get("etiquetas"))).as("sin repetir sin distinguir mayusculas")
                    .containsExactly("juvenil", "Novela");
        }

        @Test
        @DisplayName("sin materias, con materias vacias o solo genericas no cambia los generos")
        void sinMaterias() throws Exception {
            for (String md : new String[]{"{\"titulo\":\"T\"}", "{\"materias\":[]}", "{\"materias\":[\"Ficción\"]}",
                    "{\"materias\":\"no es lista\"}"}) {
                limpiarTodo();
                JsonNode a = subirLibro(ANDERSON, "libro.epub");
                marcarListo(uuid(a.get("archivoId")), 1, md);
                metadatos.revisar();
                JsonNode de = libro(ANDERSON, a);
                assertThat(de.get("generos")).as(md).isEmpty();
                assertThat(de.get("etiquetas")).as(md).isEmpty();
            }
        }

        @Test
        @DisplayName("subir un archivo que ya esta LISTO clasifica al momento la obra del nuevo ejemplar")
        void duplicadoListo() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            marcarListo(uuid(a.get("archivoId")), 3, "{\"materias\":[\"Novela; Romántico\"]}");
            metadatos.revisar();

            JsonNode s = subir(SAMY, "libro.epub", epub("libro.epub")).get("object").get(0);

            assertThat(textos(s.get("generos"))).containsExactly("Romance");
            assertThat(textos(s.get("etiquetas"))).containsExactly("Novela");
        }

        @Test
        @DisplayName("los generos escritos a mano pasan por la misma tabla de sinonimos")
        void manual() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            JsonNode o = pedir(ANDERSON, "/v1/libros/save", Map.of("id", a.get("id").asText(),
                    "generos", List.of("fantástico", "Fantasy", "Thriller", "Novela"))).get("object");
            assertThat(textos(o.get("generos"))).containsExactly("Fantasía", "Suspense", "Novela");
        }
    }

    @Nested
    @DisplayName("Relleno de los libros que ya existian")
    class Relleno {

        @Test
        @DisplayName("solo ADMIN: un usuario normal recibe 403 con el ResultDTO y no se encola nada")
        void soloAdmin() throws Exception {
            JsonNode a = subirLibro(ANDERSON, "libro.epub");
            marcarListo(uuid(a.get("archivoId")), 3, "{\"titulo\":\"Viejo\"}");

            MvcResult r = mvc.perform(post("/biblioteca" + RUTA_RELLENO).contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON))).andReturn();

            assertThat(r.getResponse().getStatus()).isEqualTo(403);
            JsonNode cuerpo = json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
            assertThat(cuerpo.get("correct").asBoolean()).isFalse();
            assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(403);
            assertThat(cuerpo.get("message").asText()).isEqualTo("No tienes permiso para hacer esto.");
            assertThat(trabajosDeRelectura()).isZero();
        }

        @Test
        @DisplayName("encola solo los archivos viejos con obras sin genero; idempotente; luego rellena sin tocar titulos")
        void rellena() throws Exception {
            JsonNode viejo = subirLibro(ANDERSON, "viejo.epub");
            JsonNode conGenero = subirLibro(ANDERSON, "con-genero.epub");
            JsonNode nuevo = subirLibro(ANDERSON, "nuevo.epub");
            JsonNode sinConvertir = subirLibro(ANDERSON, "pendiente.epub");
            UUID archivoViejo = uuid(viejo.get("archivoId"));
            marcarListo(archivoViejo, 3, "{\"titulo\":\"Título del archivo\",\"autores\":[\"Ana\"]}");
            marcarListo(uuid(conGenero.get("archivoId")), 3, "{\"titulo\":\"Otro\"}");
            marcarListo(uuid(nuevo.get("archivoId")), 3, "{\"titulo\":\"Nuevo\",\"materias\":[]}");
            metadatos.revisar();
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", viejo.get("id").asText(), "titulo", "Mi título"));
            pedir(ANDERSON, "/v1/libros/save", Map.of("id", conGenero.get("id").asText(), "generos", List.of("Ensayo")));

            JsonNode r = comoAdmin(RUTA_RELLENO).get("object");
            assertThat(r.get("archivosEncolados").asInt()).isEqualTo(1);
            assertThat(r.get("obrasSinGenero").asInt()).as("viejo, nuevo y el que aun no se convirtio").isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT archivo_id FROM bah_lib_trabajo WHERE tipo = 'RELEER_METADATOS'",
                    UUID.class)).isEqualTo(archivoViejo);
            assertThat(comoAdmin(RUTA_RELLENO).get("object").get("archivosEncolados").asInt())
                    .as("con el trabajo aun pendiente no se encola otra vez").isZero();

            tallerReleeMaterias(archivoViejo, "[\"Novela, Intriga, Psicológico\"]");
            metadatos.revisar();

            JsonNode de = libro(ANDERSON, viejo);
            assertThat(de.get("titulo").asText()).as("el relleno no toca titulos").isEqualTo("Mi título");
            assertThat(textos(de.get("generos"))).containsExactly("Suspense");
            assertThat(textos(de.get("etiquetas"))).containsExactly("Novela");
            assertThat(textos(libro(ANDERSON, conGenero).get("generos"))).containsExactly("Ensayo");
            assertThat(libro(ANDERSON, sinConvertir).get("generos")).isEmpty();

            assertThat(comoAdmin(RUTA_RELLENO).get("object").get("archivosEncolados").asInt())
                    .as("ya leidas sus materias, no vuelve a encolarse").isZero();
            assertThat(trabajosDeRelectura()).isEqualTo(1);
        }
    }
}
