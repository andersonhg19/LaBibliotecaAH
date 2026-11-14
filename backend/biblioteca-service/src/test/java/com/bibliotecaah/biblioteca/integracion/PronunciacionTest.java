package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * (B17) Diccionario de pronunciacion por libro de punta a punta en
 * biblioteca-service: GET/PUT /v1/ejemplares/{id}/pronunciacion, validacion,
 * propiedad (102), el diccionario en el payload de VOZ_CAPITULO y la
 * regeneracion de los capitulos LISTO que contienen una palabra cambiada sin
 * tocar el estado LISTO (el audio viejo sigue sonando).
 */
@DisplayName("Diccionario de pronunciacion por libro (B17)")
class PronunciacionTest extends PostgresDeVerdad {

    static final String VOZ = "edge.es-ES-AlvaroNeural";
    static final String OTRA_VOZ = "edge.es-MX-JorgeNeural";

    private String ejemplar;
    private UUID archivo;

    @BeforeEach
    void libro() throws Exception {
        JsonNode e = subirLibro(ANDERSON, "hp.epub");
        ejemplar = e.get("id").asText();
        archivo = uuid(e.get("archivoId"));
        marcarListo(archivo, 4, "{}");
        frases(0, "Hermione miró a Ron.", "Fin del capítulo.");
        frases(1, "Nada que ver aquí.");
        frases(2, "Dijo HERMIONE en voz alta.");
        // el capitulo 3 no tiene texto legible: se regenera por si acaso
    }

    // ------------------------------------------------------------------ ayudas

    private void frases(int capitulo, String... textos) throws Exception {
        List<Map<String, Object>> lista = new ArrayList<>();
        for (int i = 0; i < textos.length; i++) {
            lista.add(Map.of("id", "c%03d-s%05d".formatted(capitulo, i), "texto", textos[i], "voz", textos[i]));
        }
        escribir(DATOS.resolve("normalizados/" + archivo + "/frases/" + "cap-%03d.json".formatted(capitulo)),
                json.writeValueAsBytes(Map.of("frases", lista)));
    }

    private JsonNode llamar(long usuario, MockHttpServletRequestBuilder req, Object cuerpo) throws Exception {
        req.contextPath("/biblioteca").header("Authorization", bearer(usuario)).contentType(MediaType.APPLICATION_JSON);
        if (cuerpo != null) req.content(cuerpo instanceof String s ? s : json.writeValueAsString(cuerpo));
        MvcResult r = mvc.perform(req).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode ver(long usuario, String id) throws Exception {
        return llamar(usuario, get("/biblioteca/v1/ejemplares/" + id + "/pronunciacion"), null);
    }

    private JsonNode guardar(long usuario, String id, Object cuerpo) throws Exception {
        return llamar(usuario, put("/biblioteca/v1/ejemplares/" + id + "/pronunciacion"), cuerpo);
    }

    private static Map<String, String> entrada(String de, String a) {
        return Map.of("de", de, "a", a);
    }

    private static void error(JsonNode r, int codigo) {
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.get("errorCode").asInt()).as(r.toString()).isEqualTo(codigo);
    }

    private void audioListo(String voz, int capitulo) {
        jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg) "
                + "VALUES (?, ?, ?, 'LISTO', 60)", archivo, voz, capitulo);
    }

    private List<String> regeneraciones() {
        return jdbc.queryForList("SELECT payload->>'vozId' AS v, (payload->>'capitulo')::int AS c, prioridad "
                        + "FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' AND payload->>'regenerar' = 'true' "
                        + "ORDER BY 2, 1").stream()
                .map(m -> m.get("c") + ":" + m.get("v") + ":" + m.get("prioridad")).toList();
    }

    private String pronunciacionEnPayload(int capitulo) {
        return jdbc.queryForObject("SELECT payload->'pronunciacion' FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO' "
                + "AND (payload->>'capitulo')::int = ? ORDER BY creado DESC LIMIT 1", String.class, capitulo);
    }

    // ------------------------------------------------------------------ pruebas

    @Test
    @DisplayName("vacio al principio; PUT guarda (recortado y ordenado) y GET lo devuelve; [] lo vacia")
    void guardarYVer() throws Exception {
        JsonNode r = ver(ANDERSON, ejemplar);
        assertThat(r.get("correct").asBoolean()).isTrue();
        assertThat(r.get("object").get("entradas")).isEmpty();
        assertThat(r.get("object").get("regenerando").asInt()).isZero();

        r = guardar(ANDERSON, ejemplar, List.of(entrada("  Ron ", " Ron "), entrada("Hermione", "Jermáyoni")));
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        assertThat(r.get("object").get("entradas").toString())
                .isEqualTo("[{\"de\":\"Hermione\",\"a\":\"Jermáyoni\"},{\"de\":\"Ron\",\"a\":\"Ron\"}]");
        assertThat(ver(ANDERSON, ejemplar).get("object").get("entradas")).hasSize(2);

        assertThat(guardar(ANDERSON, ejemplar, List.of()).get("object").get("entradas")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_pronunciacion", Integer.class)).isZero();
    }

    @Test
    @DisplayName("es del libro (archivo): Samy con el mismo archivo ve y edita el mismo diccionario")
    void porArchivo() throws Exception {
        guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jermáyoni")));
        JsonNode deSamy = subir(SAMY, "hp.epub", epub("hp.epub")).get("object").get(0);
        assertThat(uuid(deSamy.get("archivoId"))).isEqualTo(archivo);
        assertThat(ver(SAMY, deSamy.get("id").asText()).get("object").get("entradas").get(0).get("a").asText())
                .isEqualTo("Jermáyoni");
    }

    @Test
    @DisplayName("IDOR -> 102 sin tocar nada; deseo -> 120; ejemplar inexistente -> 102")
    void propiedad() throws Exception {
        guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jermáyoni")));
        error(ver(SAMY, ejemplar), 102);
        error(guardar(SAMY, ejemplar, List.of(entrada("Hermione", "Otra"))), 102);
        assertThat(jdbc.queryForObject("SELECT a FROM bah_lib_pronunciacion", String.class)).isEqualTo("Jermáyoni");
        error(ver(ANDERSON, UUID.randomUUID().toString()), 102);
        JsonNode deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Un deseo")).get("object");
        error(ver(ANDERSON, deseo.get("id").asText()), 120);
        error(guardar(ANDERSON, deseo.get("id").asText(), List.of()), 120);
    }

    @Test
    @DisplayName("validacion: > 200, vacios, demasiado largos, sin letras, saltos de linea, repetidos, sin cuerpo -> 120")
    void validacion() throws Exception {
        List<Map<String, String>> muchas = new ArrayList<>();
        for (int i = 0; i <= 200; i++) muchas.add(entrada("palabra" + i, "otra"));
        error(guardar(ANDERSON, ejemplar, muchas), 120);
        assertThat(guardar(ANDERSON, ejemplar, muchas.subList(0, 200)).get("object").get("entradas")).hasSize(200);

        error(guardar(ANDERSON, ejemplar, List.of(entrada(" ", "algo"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("algo", ""))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("x".repeat(81), "y"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("x", "y".repeat(121)))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("...", "puntos"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("Her\nmione", "Jermáyoni"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jer\u0000máyoni"))), 120);
        // R3-1 (validacion r3): marcas que la voz leeria en voz alta
        error(guardar(ANDERSON, ejemplar, List.of(entrada("Ron", "<break time=\"5s\"/>Rron"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("Ron", "{Rron}"))), 120);
        error(guardar(ANDERSON, ejemplar, List.of(entrada("Ron", "R\\ron"))), 120);
        JsonNode r = guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "a"), entrada("HERMIONE", "b")));
        error(r, 120);
        assertThat(r.get("message").asText()).contains("HERMIONE");
        error(guardar(ANDERSON, ejemplar, "[{\"de\": \"Hermione\"}, null]"), 120);
        error(guardar(ANDERSON, ejemplar, "{\"de\": \"no es una lista\"}"), 120);
        error(llamar(ANDERSON, put("/biblioteca/v1/ejemplares/" + ejemplar + "/pronunciacion"), null), 120);
        assertThat(guardar(ANDERSON, ejemplar, List.of(entrada("x".repeat(80), "y".repeat(120))))
                .get("correct").asBoolean()).isTrue();
        assertThat(ver(ANDERSON, ejemplar).get("object").get("entradas")).as("lo rechazado no se guardo").hasSize(1);
    }

    @Test
    @DisplayName("el diccionario viaja en el payload de VOZ_CAPITULO (y sin diccionario el payload no cambia)")
    void enElPayload() throws Exception {
        pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", VOZ, "capitulo", 1));
        assertThat(pronunciacionEnPayload(1)).isNull();
        guardar(ANDERSON, ejemplar, List.of(entrada("Ron", "Ron"), entrada("Hermione", "Jermáyoni")));
        assertThat(pronunciacionEnPayload(1)).as("el trabajo que esperaba pasa a llevar el diccionario")
                .isEqualTo("[{\"a\": \"Jermáyoni\", \"de\": \"Hermione\"}, {\"a\": \"Ron\", \"de\": \"Ron\"}]");
        pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", VOZ, "capitulo", 0));
        assertThat(pronunciacionEnPayload(0)).contains("Jermáyoni");
    }

    @Test
    @DisplayName("regenera solo los capitulos LISTO con la palabra cambiada (y los ilegibles), sin tocar su estado LISTO")
    void regenera() throws Exception {
        audioListo(VOZ, 0);
        audioListo(VOZ, 1);
        audioListo(VOZ, 2);
        audioListo(VOZ, 3);
        audioListo(OTRA_VOZ, 0);
        JsonNode r = guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jermáyoni")));
        assertThat(regeneraciones()).containsExactly(
                "0:" + VOZ + ":30", "0:" + OTRA_VOZ + ":30", "2:" + VOZ + ":30", "3:" + VOZ + ":30");
        assertThat(r.get("object").get("regenerando").asInt()).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_audio WHERE estado = 'LISTO'", Integer.class))
                .as("el audio viejo sigue LISTO hasta que el nuevo lo sustituye").isEqualTo(5);
        assertThat(pronunciacionEnPayload(2)).contains("Jermáyoni");

        // el mismo diccionario otra vez (con otros espacios) no encola nada
        guardar(ANDERSON, ejemplar, List.of(entrada(" Hermione", "Jermáyoni ")));
        assertThat(regeneraciones()).hasSize(4);

        // una palabra que no esta en el texto no regenera nada (salvo el capitulo ilegible, que ya espera)
        guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jermáyoni"), entrada("Dumbledore", "Dambldor")));
        assertThat(regeneraciones()).hasSize(4);

        // el capitulo que se escucha pasa por delante de las regeneraciones
        JsonNode est = pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", VOZ, "capitulo", 2));
        assertThat(est.get("object").get("estado").asText()).as("sigue sonando el audio viejo").isEqualTo("LISTO");
        assertThat(est.get("object").get("url1x").asText()).endsWith("cap-002.m4a");
        assertThat(jdbc.queryForObject("SELECT prioridad FROM bah_lib_trabajo WHERE payload->>'regenerar' = 'true' "
                + "AND (payload->>'capitulo')::int = 2", Integer.class)).isEqualTo(10);

        // el taller termina las que esperaban; quitar la palabra vuelve a regenerar los que la contienen
        jdbc.update("UPDATE bah_lib_trabajo SET estado = 'HECHO'");
        assertThat(ver(ANDERSON, ejemplar).get("object").get("regenerando").asInt()).isZero();
        guardar(ANDERSON, ejemplar, List.of(entrada("Dumbledore", "Dambldor")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE estado = 'PENDIENTE' "
                + "AND payload->>'regenerar' = 'true' AND payload->'pronunciacion' IS NOT NULL", Integer.class))
                .isEqualTo(4);
    }

    @Test
    @DisplayName("un capitulo generandose con el diccionario viejo se vuelve a encolar; uno ya pendiente no se duplica")
    void enCurso() throws Exception {
        audioListo(VOZ, 0);
        jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad, estado, actualizado) VALUES "
                + "(?, 'VOZ_CAPITULO', ?, '{\"vozId\": \"" + OTRA_VOZ + "\", \"capitulo\": 2}'::jsonb, 10, 'EN_CURSO', now())",
                UUID.randomUUID(), archivo);
        guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Jermáyoni")));
        assertThat(regeneraciones()).containsExactly("0:" + VOZ + ":30", "2:" + OTRA_VOZ + ":30");
        guardar(ANDERSON, ejemplar, List.of(entrada("Hermione", "Hermaioni")));
        assertThat(regeneraciones()).as("ya esperaban: solo cambia su diccionario").hasSize(2);
        assertThat(pronunciacionEnPayload(0)).contains("Hermaioni");
    }
}
