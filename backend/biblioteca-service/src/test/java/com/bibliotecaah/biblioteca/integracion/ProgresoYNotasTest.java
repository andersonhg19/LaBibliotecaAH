package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Progreso (gana el mas reciente), anotaciones y comentarios")
class ProgresoYNotasTest extends PostgresDeVerdad {

    private String ejemplar;

    @BeforeEach
    void unLibro() throws Exception {
        ejemplar = subirLibro(ANDERSON, "libro.epub").get("id").asText();
    }

    @Nested
    @DisplayName("Progreso")
    class Progreso {

        private JsonNode guardar(int capitulo, String cuando) throws Exception {
            Map<String, Object> p = new HashMap<>(Map.of("ejemplarId", ejemplar, "capitulo", capitulo,
                    "fraseId", String.format("c%03d-s00001", capitulo), "porcentaje", capitulo * 10.0,
                    "modo", "VOZ", "vozId", "edge.es-ES-AlvaroNeural", "velocidad", 1.5, "dispositivo", "iPhone"));
            if (cuando != null) p.put("actualizadoEn", cuando);
            return pedir(ANDERSON, "/v1/progreso/save", p);
        }

        @Test
        @DisplayName("sin progreso guardado, object es nulo")
        void vacio() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/progreso/get/" + ejemplar);
            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.get("object").isNull()).isTrue();
        }

        @Test
        @DisplayName("gana el actualizadoEn mas reciente: uno viejo que llega tarde no pisa")
        void ultimaEscrituraGana() throws Exception {
            guardar(7, "2026-11-10T20:00:00Z");
            JsonNode tarde = guardar(3, "2026-11-10T19:00:00Z");

            assertThat(tarde.get("correct").asBoolean()).isTrue();
            assertThat(tarde.get("message").asText())
                    .isEqualTo("Hay un progreso más reciente guardado desde otro dispositivo; se conserva ese.");
            assertThat(tarde.get("object").get("capitulo").asInt()).isEqualTo(7);

            JsonNode nuevo = guardar(8, "2026-11-10T21:00:00Z");
            assertThat(nuevo.get("message").asText()).isEqualTo("OK");
            JsonNode leido = pedir(ANDERSON, "/v1/progreso/get/" + ejemplar).get("object");
            assertThat(leido.get("capitulo").asInt()).isEqualTo(8);
            assertThat(leido.get("fraseId").asText()).isEqualTo("c008-s00001");
            assertThat(leido.get("modo").asText()).isEqualTo("VOZ");
            assertThat(leido.get("velocidad").asDouble()).isEqualTo(1.5);
            assertThat(leido.get("actualizadoEn").asText()).isEqualTo("2026-11-10T21:00:00Z");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_progreso", Integer.class)).isEqualTo(1);
        }

        @Test
        @DisplayName("sin fecha usa la del servidor; el porcentaje se acota a 0..100 y el modo por defecto es VISTA")
        void valoresPorDefecto() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", ejemplar, "porcentaje", 250.0));
            assertThat(r.get("object").get("porcentaje").asDouble()).isEqualTo(100.0);
            assertThat(r.get("object").get("modo").asText()).isEqualTo("VISTA");
            assertThat(r.get("object").get("capitulo").asInt()).isZero();
            assertThat(r.get("object").get("actualizadoEn").isNull()).isFalse();
        }

        @Test
        @DisplayName("sin ejemplarId responde 120")
        void sinEjemplar() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/progreso/save", Map.of("capitulo", 1));
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("Revisa los datos enviados: ejemplarId es obligatorio.");
        }
    }

    @Nested
    @DisplayName("Anotaciones")
    class Anotaciones {

        @Test
        @DisplayName("crear con las tres anclas, editar (marca editado) y borrar")
        void ciclo() throws Exception {
            Map<String, Object> nueva = new HashMap<>(Map.of("ejemplarId", ejemplar, "tipo", "RESALTADO", "color", "amarillo",
                    "cfi", "epubcfi(/6/8)", "fraseInicio", "c001-s00002", "offsetInicio", 0, "fraseFin", "c001-s00003",
                    "offsetFin", 12, "versionTexto", 1));
            nueva.putAll(Map.of("textoCitado", "En un lugar", "prefijo", "antes", "sufijo", "despues", "capitulo", 1));
            JsonNode creada = pedir(ANDERSON, "/v1/anotaciones/save", nueva).get("object");
            assertThat(creada.get("tipo").asText()).isEqualTo("RESALTADO");
            assertThat(creada.get("fraseFin").asText()).isEqualTo("c001-s00003");
            assertThat(creada.get("textoCitado").asText()).isEqualTo("En un lugar");
            assertThat(creada.get("creado").isNull()).isFalse();
            assertThat(creada.get("editado").isNull()).isTrue();

            JsonNode editada = pedir(ANDERSON, "/v1/anotaciones/save", Map.of("id", creada.get("id").asText(),
                    "ejemplarId", ejemplar, "tipo", "NOTA", "nota", "me gusta")).get("object");
            assertThat(editada.get("tipo").asText()).isEqualTo("NOTA");
            assertThat(editada.get("nota").asText()).isEqualTo("me gusta");
            assertThat(editada.get("editado").isNull()).isFalse();

            assertThat(pedir(ANDERSON, "/v1/libros/get/" + ejemplar).get("object").get("nNotas").asInt()).isEqualTo(1);
            assertThat(pedir(ANDERSON, "/v1/anotaciones/delete/" + creada.get("id").asText()).get("object").asBoolean()).isTrue();
            assertThat(pedir(ANDERSON, "/v1/anotaciones/all/" + ejemplar).get("object")).isEmpty();
        }

        @Test
        @DisplayName("mover una anotacion a otro libro no se permite; sin tipo responde 120")
        void reglas() throws Exception {
            String otro = subirLibro(ANDERSON, "otro.epub").get("id").asText();
            String id = pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", ejemplar, "tipo", "MARCADOR"))
                    .get("object").get("id").asText();
            JsonNode r = pedir(ANDERSON, "/v1/anotaciones/save", Map.of("id", id, "ejemplarId", otro, "tipo", "MARCADOR"));
            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", ejemplar)).get("errorCode").asInt())
                    .isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", ejemplar, "tipo", "SUBRAYADO"))
                    .get("message").asText()).startsWith("El campo \"tipo\" no admite el valor enviado");
        }
    }

    @Nested
    @DisplayName("Comentarios")
    class Comentarios {

        @Test
        @DisplayName("crear, editar, listar en orden y borrar")
        void ciclo() throws Exception {
            JsonNode c = pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", " Lo empecé en el bus "))
                    .get("object");
            assertThat(c.get("texto").asText()).isEqualTo("Lo empecé en el bus");
            pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", "Segundo"));
            JsonNode editado = pedir(ANDERSON, "/v1/comentarios/save",
                    Map.of("id", c.get("id").asText(), "ejemplarId", ejemplar, "texto", "Primero")).get("object");
            assertThat(editado.get("texto").asText()).isEqualTo("Primero");

            JsonNode todos = pedir(ANDERSON, "/v1/comentarios/all/" + ejemplar).get("object");
            assertThat(todos).hasSize(2);
            assertThat(todos.get(0).get("texto").asText()).isEqualTo("Primero");
            assertThat(pedir(ANDERSON, "/v1/comentarios/delete/" + c.get("id").asText()).get("object").asBoolean()).isTrue();
            assertThat(pedir(ANDERSON, "/v1/comentarios/all/" + ejemplar).get("object")).hasSize(1);
        }

        @Test
        @DisplayName("texto vacio responde 120; mover a otro libro o un id inexistente responde 102")
        void reglas() throws Exception {
            assertThat(pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", " "))
                    .get("errorCode").asInt()).isEqualTo(120);
            String otro = subirLibro(ANDERSON, "otro.epub").get("id").asText();
            String id = pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", "a"))
                    .get("object").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/comentarios/save", Map.of("id", id, "ejemplarId", otro, "texto", "b"))
                    .get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/comentarios/delete/" + UUID.randomUUID()).get("message").asText())
                    .isEqualTo("El comentario no existe o no es tuyo.");
        }
    }
}
