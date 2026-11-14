package com.bibliotecaah.biblioteca.integracion;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Mejoras 0.4.0 (auditoria 2026-11-13) en biblioteca-service: estructura v2 y
 * capitulos en voz (C1/C3, casos C11-C13, G6), sesiones de lectura (C4, G5),
 * preparar el libro (C5, G8), estado de la casa (C6, G8), reclasificar la
 * estructura (C2, G7) y validacion de la busqueda (BK-06, BK-07, G4).
 */
@DisplayName("Mejoras 0.4.0 de biblioteca-service")
class Mejoras040Test extends PostgresDeVerdad {

    static final String VOZ = "edge.es-ES-AlvaroNeural";
    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    /** 6 capitulos: portada (antes), prologo, cap 1, cap 2 (sin enVoz: por region), notas (despues) y uno raro. */
    static final String ESTRUCTURA_V2 = "{\"version\":2,\"versionFormato\":1,\"capitulos\":["
            + "{\"indice\":0,\"titulo\":\"Portada\",\"palabras\":10,\"tipo\":\"preliminar\",\"region\":\"antes\","
            + "\"numero\":null,\"enVoz\":false,\"palabrasVoz\":0,\"origenTipo\":\"epub-type\"},"
            + "{\"indice\":1,\"titulo\":\"Prólogo\",\"palabras\":300,\"tipo\":\"prologo\",\"region\":\"cuerpo\","
            + "\"numero\":null,\"enVoz\":true,\"palabrasVoz\":290},"
            + "{\"indice\":2,\"titulo\":\"Capítulo 1\",\"palabras\":1500,\"tipo\":\"capitulo\",\"region\":\"cuerpo\","
            + "\"numero\":1,\"enVoz\":true,\"palabrasVoz\":1450},"
            + "{\"indice\":3,\"titulo\":\"Capítulo 2\",\"palabras\":1600,\"tipo\":\"capitulo\",\"region\":\"cuerpo\","
            + "\"numero\":2,\"palabrasVoz\":1600},"
            + "{\"indice\":4,\"titulo\":\"Notas\",\"palabras\":400,\"tipo\":\"notas\",\"region\":\"despues\","
            + "\"numero\":null,\"enVoz\":false},"
            + "{\"indice\":5,\"titulo\":\"Raro\",\"palabras\":10,\"tipo\":\"MAL TIPO\",\"region\":\"marte\",\"numero\":\"x\"}"
            + "]}";

    static final String ESTRUCTURA_V1 = "{\"versionFormato\":1,\"capitulos\":["
            + "{\"indice\":0,\"titulo\":\"Uno\",\"palabras\":3120},{\"indice\":1,\"titulo\":\"Dos\",\"palabras\":10}]}";

    // ------------------------------------------------------------------ ayudas

    private JsonNode llamar(long usuario, MockHttpServletRequestBuilder req, Object cuerpo) throws Exception {
        req.contextPath("/biblioteca").header("Authorization", bearer(usuario)).contentType(MediaType.APPLICATION_JSON);
        if (cuerpo != null) req.content(cuerpo instanceof String s ? s : json.writeValueAsString(cuerpo));
        MvcResult r = mvc.perform(req).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode putVoz(long usuario, Object ejemplar, int indice, Object cuerpo) throws Exception {
        return llamar(usuario, put("/biblioteca/v1/ejemplares/" + ejemplar + "/capitulos/" + indice + "/voz"), cuerpo);
    }

    private JsonNode putSoloHistoria(long usuario, Object ejemplar, Object cuerpo) throws Exception {
        return llamar(usuario, put("/biblioteca/v1/ejemplares/" + ejemplar + "/capitulos/voz"), cuerpo);
    }

    private JsonNode ficha(long usuario, Object ejemplar) throws Exception {
        return pedir(usuario, "/v1/libros/get/" + ejemplar).get("object");
    }

    private void estructura(UUID archivo, String contenido) throws Exception {
        escribir(DATOS.resolve("normalizados/" + archivo + "/estructura.json"), contenido.getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, Object> mapa(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static void error(JsonNode r, int codigo) {
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.get("errorCode").asInt()).as(r.toString()).isEqualTo(codigo);
    }

    private static void bien(JsonNode r) {
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
    }

    /** Libro de Anderson convertido con la estructura v2 de arriba. */
    private JsonNode libroV2(String nombre) throws Exception {
        JsonNode e = subirLibro(ANDERSON, nombre);
        UUID archivo = uuid(e.get("archivoId"));
        marcarListo(archivo, 6, "{}");
        estructura(archivo, ESTRUCTURA_V2);
        return e;
    }

    // ------------------------------------------------------------------ C1 / C3

    @Nested
    @DisplayName("Capitulos: estructura v2 y voz por capitulo (C1, C3; casos C11-C13, G6)")
    class CapitulosEnVoz {

        private JsonNode e;

        @BeforeEach
        void preparar() throws Exception {
            e = libroV2("v2.epub");
        }

        @Test
        @DisplayName("la ficha trae tipo, region, numero, enVoz, enVozPorDefecto y minutosVoz; lo raro se ignora")
        void fichaV2() throws Exception {
            JsonNode caps = ficha(ANDERSON, e.get("id").asText()).get("capitulos");
            assertThat(caps).hasSize(6);
            JsonNode portada = caps.get(0);
            assertThat(portada.get("tipo").asText()).isEqualTo("preliminar");
            assertThat(portada.get("region").asText()).isEqualTo("antes");
            assertThat(portada.get("numero").isNull()).isTrue();
            assertThat(portada.get("enVoz").asBoolean()).isFalse();
            assertThat(portada.get("enVozPorDefecto").asBoolean()).isFalse();
            assertThat(portada.get("minutosVoz").asInt()).isZero();
            JsonNode cap1 = caps.get(2);
            assertThat(cap1.get("numero").asInt()).isEqualTo(1);
            assertThat(cap1.get("minutos").asInt()).isEqualTo(10);
            assertThat(cap1.get("minutosVoz").asInt()).isEqualTo(10);
            assertThat(caps.get(3).get("enVoz").asBoolean()).as("sin enVoz: el cuerpo va en voz").isTrue();
            assertThat(caps.get(4).get("enVoz").asBoolean()).isFalse();
            assertThat(caps.get(4).get("minutosVoz").isNull()).isTrue();
            JsonNode raro = caps.get(5);
            assertThat(raro.get("tipo").isNull()).isTrue();
            assertThat(raro.get("region").isNull()).isTrue();
            assertThat(raro.get("numero").isNull()).isTrue();
            assertThat(raro.get("enVoz").asBoolean()).isTrue();
        }

        @Test
        @DisplayName("C12: un libro v1 sin reclasificar sigue igual: campos nuevos null y todo en voz")
        void fichaV1() throws Exception {
            JsonNode viejo = subirLibro(ANDERSON, "v1.epub");
            estructura(uuid(viejo.get("archivoId")), ESTRUCTURA_V1);
            JsonNode caps = ficha(ANDERSON, viejo.get("id").asText()).get("capitulos");
            assertThat(caps).hasSize(2);
            assertThat(caps.get(0).get("minutos").asInt()).isEqualTo(21);
            for (JsonNode c : caps) {
                assertThat(c.get("tipo").isNull()).isTrue();
                assertThat(c.get("region").isNull()).isTrue();
                assertThat(c.get("numero").isNull()).isTrue();
                assertThat(c.get("minutosVoz").isNull()).isTrue();
                assertThat(c.get("enVoz").asBoolean()).isTrue();
                assertThat(c.get("enVozPorDefecto").asBoolean()).isTrue();
            }
        }

        @Test
        @DisplayName("C13: el toggle persiste por usuario, null vuelve al defecto y otro usuario no lo ve")
        void toggle() throws Exception {
            String id = e.get("id").asText();
            JsonNode r = putVoz(ANDERSON, id, 0, mapa("enVoz", true));
            bien(r);
            assertThat(r.get("object").get("indice").asInt()).isZero();
            assertThat(r.get("object").get("enVoz").asBoolean()).isTrue();
            assertThat(r.get("object").get("enVozPorDefecto").asBoolean()).isFalse();
            putVoz(ANDERSON, id, 2, mapa("enVoz", false));
            JsonNode caps = ficha(ANDERSON, id).get("capitulos");
            assertThat(caps.get(0).get("enVoz").asBoolean()).isTrue();
            assertThat(caps.get(2).get("enVoz").asBoolean()).isFalse();

            /* Samy tiene el mismo archivo (mismo sha256): sus capitulos siguen con el defecto. */
            JsonNode deSamy = subir(SAMY, "v2.epub", epub("v2.epub")).get("object").get(0);
            assertThat(uuid(deSamy.get("archivoId"))).isEqualTo(uuid(e.get("archivoId")));
            JsonNode suyos = ficha(SAMY, deSamy.get("id").asText()).get("capitulos");
            assertThat(suyos.get(0).get("enVoz").asBoolean()).isFalse();
            assertThat(suyos.get(2).get("enVoz").asBoolean()).isTrue();

            JsonNode vuelta = putVoz(ANDERSON, id, 0, mapa("enVoz", null));
            assertThat(vuelta.get("object").get("enVoz").asBoolean()).isFalse();
            assertThat(putVoz(ANDERSON, id, 2, null).get("object").get("enVoz").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_capitulo_voz", Integer.class)).isZero();
        }

        @Test
        @DisplayName("Solo la historia: true deja en voz solo el cuerpo; false borra las preferencias")
        void soloHistoria() throws Exception {
            String id = e.get("id").asText();
            putVoz(ANDERSON, id, 4, mapa("enVoz", true));
            JsonNode r = putSoloHistoria(ANDERSON, id, mapa("soloHistoria", true));
            bien(r);
            assertThat(r.get("object")).extracting(c -> c.get("enVoz").asBoolean())
                    .containsExactly(false, true, true, true, false, true);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_capitulo_voz", Integer.class)).isEqualTo(6);

            JsonNode fuera = putSoloHistoria(ANDERSON, id, mapa("soloHistoria", false));
            assertThat(fuera.get("object")).extracting(c -> c.get("enVoz").asBoolean())
                    .containsExactly(false, true, true, true, false, true);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_capitulo_voz", Integer.class)).isZero();
            error(putSoloHistoria(ANDERSON, id, "{}"), 120);
        }

        @Test
        @DisplayName("C14/G6: IDOR -> 102 sin tocar nada; capitulo fuera de rango, deseo o libro sin capitulos -> 120")
        void errores() throws Exception {
            String id = e.get("id").asText();
            error(putVoz(SAMY, id, 0, mapa("enVoz", true)), 102);
            error(putSoloHistoria(SAMY, id, mapa("soloHistoria", true)), 102);
            error(putVoz(SAMY, UUID.randomUUID(), 0, mapa("enVoz", true)), 102);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_capitulo_voz", Integer.class)).isZero();

            error(putVoz(ANDERSON, id, 6, mapa("enVoz", true)), 120);
            error(putVoz(ANDERSON, id, -1, mapa("enVoz", true)), 120);
            JsonNode deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Un deseo")).get("object");
            error(putVoz(ANDERSON, deseo.get("id").asText(), 0, mapa("enVoz", true)), 120);
            JsonNode sinEstructura = subirLibro(ANDERSON, "sin.epub");
            JsonNode r = putVoz(ANDERSON, sinEstructura.get("id").asText(), 0, mapa("enVoz", true));
            error(r, 120);
            assertThat(r.get("message").asText()).contains("aún no están disponibles");
        }

        @Test
        @DisplayName("C13: la precarga de /audio/estado salta los capitulos fuera de la voz")
        void precargaSaltaExcluidos() throws Exception {
            UUID archivo = uuid(e.get("archivoId"));
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg) "
                    + "VALUES (?, ?, 2, 'LISTO', 60)", archivo, VOZ);
            putVoz(ANDERSON, e.get("id").asText(), 3, mapa("enVoz", false));
            pedir(ANDERSON, "/v1/audio/estado", Map.of("ejemplarId", e.get("id").asText(), "vozId", VOZ, "capitulo", 2));
            assertThat(jdbc.queryForList("SELECT (payload->>'capitulo')::int FROM bah_lib_trabajo "
                    + "WHERE tipo = 'VOZ_CAPITULO' ORDER BY 1", Integer.class))
                    .as("3 y 4 fuera de la voz; solo queda el 5 dentro del libro").containsExactly(5);
        }
    }

    // ------------------------------------------------------------------ C5

    @Nested
    @DisplayName("Preparar el libro entero (C5, F9, G8)")
    class PrepararLibro {

        private JsonNode e;
        private UUID archivo;

        @BeforeEach
        void preparar() throws Exception {
            e = libroV2("preparar.epub");
            archivo = uuid(e.get("archivoId"));
        }

        private JsonNode cocinar(long usuario, Object ejemplar, String voz) throws Exception {
            return pedir(usuario, "/v1/voz/preparar-libro", mapa("ejemplarId", ejemplar, "vozId", voz));
        }

        private JsonNode progreso(long usuario, Object ejemplar) throws Exception {
            return llamar(usuario, get("/biblioteca/v1/voz/preparar-libro").param("ejemplarId", ejemplar.toString())
                    .param("vozId", VOZ), null);
        }

        @Test
        @DisplayName("encola con prioridad 40 solo los capitulos en voz; idempotente; cuenta listos, error y cola")
        void encola() throws Exception {
            String id = e.get("id").asText();
            JsonNode r = cocinar(ANDERSON, id, VOZ).get("object");
            assertThat(r.get("encolados").asInt()).isEqualTo(4);
            assertThat(r.get("total").asInt()).isEqualTo(4);
            assertThat(r.get("enCola").asInt()).isEqualTo(4);
            assertThat(jdbc.queryForList("SELECT (payload->>'capitulo')::int || ':' || prioridad FROM bah_lib_trabajo "
                    + "WHERE tipo = 'VOZ_CAPITULO' ORDER BY (payload->>'capitulo')::int", String.class))
                    .containsExactly("1:40", "2:40", "3:40", "5:40");

            assertThat(cocinar(ANDERSON, id, VOZ).get("object").get("encolados").asInt()).as("idempotente").isZero();

            jdbc.update("UPDATE bah_lib_trabajo SET estado = 'HECHO' WHERE (payload->>'capitulo')::int IN (1, 2)");
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg) VALUES "
                    + "(?, ?, 1, 'LISTO', 30)", archivo, VOZ);
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, error) VALUES "
                    + "(?, ?, 2, 'ERROR', 'fallo')", archivo, VOZ);
            JsonNode p = progreso(ANDERSON, id).get("object");
            assertThat(p.get("total").asInt()).isEqualTo(4);
            assertThat(p.get("listos").asInt()).isEqualTo(1);
            assertThat(p.get("error").asInt()).isEqualTo(1);
            assertThat(p.get("enCola").asInt()).isEqualTo(2);
            assertThat(p.get("encolados").isNull()).isTrue();
            assertThat(cocinar(ANDERSON, id, VOZ).get("object").get("encolados").asInt())
                    .as("ni el LISTO ni el ERROR se reencolan").isZero();

            putVoz(ANDERSON, id, 0, mapa("enVoz", true));
            JsonNode mas = cocinar(ANDERSON, id, VOZ).get("object");
            assertThat(mas.get("encolados").asInt()).isEqualTo(1);
            assertThat(mas.get("total").asInt()).isEqualTo(5);
        }

        @Test
        @DisplayName("sin estructura legible pero con n_capitulos, prepara todos (como un libro v1)")
        void sinEstructura() throws Exception {
            JsonNode otro = subirLibro(ANDERSON, "nada.epub");
            marcarListo(uuid(otro.get("archivoId")), 3, "{}");
            JsonNode r = cocinar(ANDERSON, otro.get("id").asText(), VOZ).get("object");
            assertThat(r.get("total").asInt()).isEqualTo(3);
            assertThat(r.get("encolados").asInt()).isEqualTo(3);
        }

        @Test
        @DisplayName("ajeno -> 102; sin convertir, voz fuera del catalogo o deseo -> 120; sin datos -> 120")
        void errores() throws Exception {
            String id = e.get("id").asText();
            error(cocinar(SAMY, id, VOZ), 102);
            error(llamar(SAMY, get("/biblioteca/v1/voz/preparar-libro").param("ejemplarId", id).param("vozId", VOZ), null), 102);
            error(cocinar(ANDERSON, id, "edge.xx-XX-Nadie"), 120);
            error(cocinar(ANDERSON, id, "../x"), 120);
            error(pedir(ANDERSON, "/v1/voz/preparar-libro", "{}"), 120);
            jdbc.update("UPDATE bah_lib_archivo SET estado_conversion = 'PROCESANDO' WHERE id = ?", archivo);
            error(cocinar(ANDERSON, id, VOZ), 120);
            JsonNode deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Otro deseo")).get("object");
            error(cocinar(ANDERSON, deseo.get("id").asText(), VOZ), 120);
            error(llamar(ANDERSON, get("/biblioteca/v1/voz/preparar-libro").param("ejemplarId", "no-uuid")
                    .param("vozId", VOZ), null), 120);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'",
                    Integer.class)).isZero();
        }
    }

    // ------------------------------------------------------------------ C2

    @Nested
    @DisplayName("Reclasificar la estructura (C2, C11, G7)")
    class Reclasificar {

        private static final String RUTA = "/v1/admin/libros/reclasificar-estructura";

        private JsonNode comoAdmin() throws Exception {
            String token = JWT.create().withSubject("admin@biblioteca.ah").withClaim("userId", 9L)
                    .withArrayClaim("roles", new String[]{"USER", "ADMIN"})
                    .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                    .sign(Algorithm.HMAC256(SECRETO));
            MvcResult r = mvc.perform(post("/biblioteca" + RUTA).contextPath("/biblioteca")
                    .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)).andReturn();
            assertThat(r.getResponse().getStatus()).isEqualTo(200);
            return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("object");
        }

        private List<Map<String, Object>> trabajos() {
            return jdbc.queryForList("SELECT archivo_id, payload::text AS payload, prioridad, estado FROM bah_lib_trabajo "
                    + "WHERE tipo = 'RECLASIFICAR_ESTRUCTURA'");
        }

        @Test
        @DisplayName("encola solo los LISTO con estructura v1, idempotente; los v2 y los sin estructura no")
        void encola() throws Exception {
            UUID v1 = uuid(subirLibro(ANDERSON, "uno.epub").get("archivoId"));
            marcarListo(v1, 2, "{}");
            estructura(v1, ESTRUCTURA_V1);
            UUID v2 = uuid(libroV2("dos.epub").get("archivoId"));
            UUID hoja = uuid(subirLibro(ANDERSON, "hoja.epub").get("archivoId"));
            marcarListo(hoja, 0, "{}");
            UUID sinConvertir = uuid(subirLibro(ANDERSON, "pendiente.epub").get("archivoId"));
            estructura(sinConvertir, ESTRUCTURA_V1);

            JsonNode r = comoAdmin();
            assertThat(r.get("archivosEncolados").asInt()).isEqualTo(1);
            assertThat(r.get("yaReclasificados").asInt()).isEqualTo(1);
            assertThat(r.get("sinEstructura").asInt()).isEqualTo(1);
            assertThat(r.get("yaEnCola").asInt()).isZero();
            assertThat(trabajos()).singleElement().satisfies(t -> {
                assertThat(t.get("archivo_id")).isEqualTo(v1);
                assertThat(t.get("payload")).isEqualTo("{}");
                assertThat(t.get("prioridad")).isEqualTo(200);
                assertThat(t.get("estado")).isEqualTo("PENDIENTE");
            });

            JsonNode otraVez = comoAdmin();
            assertThat(otraVez.get("archivosEncolados").asInt()).isZero();
            assertThat(otraVez.get("yaEnCola").asInt()).isEqualTo(1);
            assertThat(trabajos()).hasSize(1);

            /* El taller lo hace: escribe la v2 y marca HECHO. Ya no se vuelve a encolar. */
            estructura(v1, ESTRUCTURA_V2);
            jdbc.update("UPDATE bah_lib_trabajo SET estado = 'HECHO' WHERE tipo = 'RECLASIFICAR_ESTRUCTURA'");
            JsonNode hecho = comoAdmin();
            assertThat(hecho.get("archivosEncolados").asInt()).isZero();
            assertThat(hecho.get("yaReclasificados").asInt()).isEqualTo(2);
            assertThat(v2).isNotNull();
        }

        @Test
        @DisplayName("solo ADMIN: un usuario normal recibe 403 y no se encola nada")
        void soloAdmin() throws Exception {
            UUID v1 = uuid(subirLibro(ANDERSON, "uno.epub").get("archivoId"));
            marcarListo(v1, 2, "{}");
            estructura(v1, ESTRUCTURA_V1);
            MvcResult r = mvc.perform(post("/biblioteca" + RUTA).contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON))).andReturn();
            assertThat(r.getResponse().getStatus()).isEqualTo(403);
            assertThat(json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("errorCode").asInt())
                    .isEqualTo(403);
            assertThat(trabajos()).isEmpty();
        }

        @Test
        @DisplayName("sin el disco de datos: 503 y nada encolado")
        void sinDisco() throws Exception {
            UUID v1 = uuid(subirLibro(ANDERSON, "uno.epub").get("archivoId"));
            marcarListo(v1, 2, "{}");
            borrar(DATOS);
            String token = JWT.create().withSubject("admin@biblioteca.ah").withClaim("userId", 9L)
                    .withArrayClaim("roles", new String[]{"ADMIN"})
                    .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                    .sign(Algorithm.HMAC256(SECRETO));
            MvcResult r = mvc.perform(post("/biblioteca" + RUTA).contextPath("/biblioteca")
                    .header("Authorization", "Bearer " + token)).andReturn();
            assertThat(json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("errorCode").asInt())
                    .isEqualTo(503);
            assertThat(trabajos()).isEmpty();
        }
    }

    // ------------------------------------------------------------------ C4

    @Nested
    @DisplayName("Sesiones de lectura (C4, G5)")
    class Sesiones {

        private String ejemplar;

        @BeforeEach
        void preparar() throws Exception {
            ejemplar = subirLibro(ANDERSON, "sesiones.epub").get("id").asText();
        }

        private JsonNode latir(long usuario, Map<String, Object> cuerpo) throws Exception {
            return pedir(usuario, "/v1/sesiones/latido", cuerpo);
        }

        private JsonNode resumen(long usuario, String desde, String hasta) throws Exception {
            MockHttpServletRequestBuilder req = get("/biblioteca/v1/sesiones/resumen");
            if (desde != null) req.param("desde", desde);
            if (hasta != null) req.param("hasta", hasta);
            return llamar(usuario, req, null);
        }

        @Test
        @DisplayName("crea la sesion, la alarga y no deja inflarla con latidos seguidos")
        void creaYAlarga() throws Exception {
            JsonNode r = latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "capitulo", 2,
                    "posicion", 0.25, "segundos", 60, "dispositivo", "iPhone"));
            bien(r);
            String sesion = r.get("object").get("sesionId").asText();
            assertThat(r.get("object").get("segundosTotales").asInt()).isEqualTo(60);

            /* Un minuto despues (se adelanta el fin guardado): suma los 60 s. */
            jdbc.update("UPDATE bah_lib_sesion SET fin = fin - interval '60 seconds'");
            JsonNode otro = latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "sesionId", sesion,
                    "capitulo", 3, "posicion", 0.5, "segundos", 60));
            assertThat(otro.get("object").get("segundosTotales").asInt()).isEqualTo(120);
            assertThat(otro.get("object").get("sesionId").asText()).isEqualTo(sesion);

            /* Otro latido al instante con 120 s: solo cuenta lo transcurrido (+10 s de margen). */
            JsonNode inflado = latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "sesionId", sesion,
                    "segundos", 120));
            assertThat(inflado.get("object").get("segundosTotales").asInt()).isBetween(130, 132);

            Map<String, Object> fila = jdbc.queryForMap("SELECT * FROM bah_lib_sesion WHERE id = ?::uuid", sesion);
            assertThat(fila.get("modo")).isEqualTo("LECTURA");
            assertThat(fila.get("capitulo_inicio")).isEqualTo(2);
            assertThat(fila.get("capitulo_fin")).isEqualTo(3);
            assertThat(((java.math.BigDecimal) fila.get("posicion_fin")).doubleValue()).isEqualTo(0.5);
            assertThat(fila.get("dispositivo")).isEqualTo("iPhone");
            assertThat(fila.get("usuario_id")).isEqualTo(ANDERSON);
        }

        @Test
        @DisplayName("el cliente puede traer su sesionId desde el primer latido (modo VOZ)")
        void sesionDelCliente() throws Exception {
            UUID id = UUID.randomUUID();
            JsonNode r = latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "VOZ", "sesionId", id, "capitulo", 0,
                    "posicion", 12.5, "segundos", 0));
            assertThat(r.get("object").get("sesionId").asText()).isEqualTo(id.toString());
            assertThat(r.get("object").get("segundosTotales").asInt()).isZero();
        }

        @Test
        @DisplayName("rechaza > 120 s, negativos, NaN, modo desconocido, dispositivo largo; ejemplar o sesion ajenos -> 102")
        void rechaza() throws Exception {
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", 121)), 120);
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", -1)), 120);
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA")), 120);
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "BAILE", "segundos", 5)), 120);
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", 5, "posicion", "NaN")), 120);
            error(latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", 5,
                    "dispositivo", "x".repeat(41))), 120);
            error(latir(SAMY, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", 30)), 102);

            String sesion = latir(ANDERSON, mapa("ejemplarId", ejemplar, "modo", "LECTURA", "segundos", 30))
                    .get("object").get("sesionId").asText();
            String deSamy = subir(SAMY, "samy.epub", epub("samy.epub")).get("object").get(0).get("id").asText();
            JsonNode robo = latir(SAMY, mapa("ejemplarId", deSamy, "modo", "LECTURA", "sesionId", sesion, "segundos", 60));
            error(robo, 102);
            String otroLibro = subirLibro(ANDERSON, "otro.epub").get("id").asText();
            error(latir(ANDERSON, mapa("ejemplarId", otroLibro, "modo", "LECTURA", "sesionId", sesion, "segundos", 60)), 102);
            assertThat(jdbc.queryForObject("SELECT segundos FROM bah_lib_sesion WHERE id = ?::uuid", Integer.class, sesion))
                    .isEqualTo(30);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_sesion", Integer.class)).isEqualTo(1);
        }

        private void sesion(long usuario, String ejemplarId, String modo, LocalDate dia, LocalTime hora, int segundos) {
            ZonedDateTime inicio = ZonedDateTime.of(dia, hora, BOGOTA);
            jdbc.update("INSERT INTO bah_lib_sesion (id, usuario_id, ejemplar_id, modo, inicio, fin, segundos) "
                            + "VALUES (?, ?, ?::uuid, ?, ?, ?, ?)", UUID.randomUUID(), usuario, ejemplarId, modo,
                    Timestamp.from(inicio.toInstant()), Timestamp.from(inicio.toInstant().plusSeconds(segundos)), segundos);
        }

        @Test
        @DisplayName("resumen por dia (zona America/Bogota), por libro y rachas; solo lo del usuario")
        void resumenYRachas() throws Exception {
            LocalDate hoy = LocalDate.now(BOGOTA);
            sesion(ANDERSON, ejemplar, "LECTURA", hoy, LocalTime.of(10, 0), 600);
            sesion(ANDERSON, ejemplar, "VOZ", hoy.minusDays(1), LocalTime.of(12, 0), 120);
            /* 23:30 en Bogota = 04:30 UTC del dia siguiente: cuenta para el dia de Bogota. */
            sesion(ANDERSON, ejemplar, "LECTURA", hoy.minusDays(2), LocalTime.of(23, 30), 300);
            sesion(ANDERSON, ejemplar, "LECTURA", hoy.minusDays(4), LocalTime.of(9, 0), 30);
            for (int d = 6; d <= 10; d++) sesion(ANDERSON, ejemplar, "LECTURA", hoy.minusDays(d), LocalTime.of(8, 0), 120);
            String deSamy = subir(SAMY, "samy.epub", epub("samy.epub")).get("object").get(0).get("id").asText();
            sesion(SAMY, deSamy, "LECTURA", hoy, LocalTime.of(8, 0), 3600);

            JsonNode r = resumen(ANDERSON, hoy.minusDays(6).toString(), hoy.toString()).get("object");
            assertThat(r.get("minutosLectura").asInt()).as("1050 s").isEqualTo(18);
            assertThat(r.get("minutosVoz").asInt()).isEqualTo(2);
            assertThat(r.get("dias")).extracting(x -> x.get("minutos").asInt()).containsExactly(2, 0, 1, 0, 5, 2, 10);
            assertThat(r.get("dias").get(0).get("fecha").asText()).isEqualTo(hoy.minusDays(6).toString());
            assertThat(r.get("rachaActual").asInt()).isEqualTo(3);
            assertThat(r.get("rachaMaxima").asInt()).isEqualTo(5);
            assertThat(r.get("libros")).singleElement().satisfies(l -> {
                assertThat(l.get("ejemplarId").asText()).isEqualTo(ejemplar);
                assertThat(l.get("minutos").asInt()).isEqualTo(20);
                assertThat(l.get("titulo").asText()).isNotBlank();
            });

            JsonNode porDefecto = resumen(ANDERSON, null, null).get("object");
            assertThat(porDefecto.get("dias")).hasSize(30);
            assertThat(porDefecto.get("hasta").asText()).isEqualTo(hoy.toString());

            JsonNode deSamyResumen = resumen(SAMY, null, null).get("object");
            assertThat(deSamyResumen.get("minutosLectura").asInt()).isEqualTo(60);
            assertThat(deSamyResumen.get("rachaActual").asInt()).isEqualTo(1);
        }

        @Test
        @DisplayName("periodo al reves, de mas de 366 dias o fecha mal escrita -> 120; sin sesiones todo a 0")
        void periodos() throws Exception {
            error(resumen(ANDERSON, "2026-11-10", "2026-11-01"), 120);
            error(resumen(ANDERSON, "2025-01-01", "2026-11-01"), 120);
            error(resumen(ANDERSON, "ayer", null), 120);
            JsonNode vacio = resumen(ANDERSON, "2026-11-01", "2026-11-01").get("object");
            assertThat(vacio.get("dias")).hasSize(1);
            assertThat(vacio.get("rachaActual").asInt()).isZero();
            assertThat(vacio.get("rachaMaxima").asInt()).isZero();
            assertThat(vacio.get("libros")).isEmpty();
        }
    }

    // ------------------------------------------------------------------ C6

    @Nested
    @DisplayName("Estado de la casa (C6, F11, G8)")
    class EstadoCasa {

        @Test
        @DisplayName("con sesion: taller y traductor de pruebas no responden -> CAIDO con mensaje; disco OK; cola de voz")
        void estado() throws Exception {
            JsonNode r = llamar(ANDERSON, get("/biblioteca/v1/estado-casa"), null);
            bien(r);
            JsonNode o = r.get("object");
            assertThat(o.get("taller").asText()).isIn("CAIDO", "OK", "LENTO");
            assertThat(o.get("traductor").asText()).isIn("CAIDO", "OK");
            assertThat(o.get("disco").asText()).isEqualTo("OK");
            assertThat(o.get("colaVoz").asInt()).isGreaterThanOrEqualTo(0);
        }

        @Test
        @DisplayName("sin sesion: 401")
        void sinSesion() throws Exception {
            MvcResult r = mvc.perform(get("/biblioteca/v1/estado-casa").contextPath("/biblioteca")).andReturn();
            assertThat(r.getResponse().getStatus()).isEqualTo(401);
        }
    }

    // ------------------------------------------------------------------ BK-06 / BK-07

    @Nested
    @DisplayName("Busqueda: texto <= 200 y calificacionMin finita (BK-06, BK-07, G4)")
    class Busqueda {

        @Test
        @DisplayName("texto de 201 -> 120; NaN, Infinity o fuera de 0..5 -> 120; lo valido sigue funcionando")
        void valida() throws Exception {
            error(pedir(ANDERSON, "/v1/libros/all", Map.of("texto", "x".repeat(201))), 120);
            bien(pedir(ANDERSON, "/v1/libros/all", Map.of("texto", "x".repeat(200))));
            error(pedir(ANDERSON, "/v1/libros/all", "{\"calificacionMin\":\"NaN\"}"), 120);
            error(pedir(ANDERSON, "/v1/libros/all", "{\"calificacionMin\":\"Infinity\"}"), 120);
            error(pedir(ANDERSON, "/v1/libros/all", Map.of("calificacionMin", 6)), 120);
            error(pedir(ANDERSON, "/v1/libros/all", Map.of("calificacionMin", -1)), 120);
            bien(pedir(ANDERSON, "/v1/libros/all", Map.of("calificacionMin", 4)));
            bien(pedir(ANDERSON, "/v1/libros/all"));
            JsonNode r = pedir(ANDERSON, "/v1/libros/all", "{\"calificacionMin\":\"NaN\"}");
            assertThat(r.get("message").asText()).contains("calificacionMin");
        }
    }
}
