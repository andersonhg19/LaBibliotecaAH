package com.bibliotecaah.biblioteca.integracion;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.service.impl.DiarioServiceImpl;
import com.bibliotecaah.biblioteca.service.impl.TareaDiario;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Mejoras 0.5.0 en biblioteca-service: diario del reproductor (C9), "Leyendo" solo con avance de verdad
 * (C10.1), preparar desde donde vas (C10.2) y libros solo registro (C11).
 */
@DisplayName("Mejoras 0.5.0 de biblioteca-service")
class Mejoras050Test extends PostgresDeVerdad {

    static final String VOZ = "edge.es-ES-AlvaroNeural";
    static final String SOLO_REGISTRO = "Este libro no tiene archivo: es solo registro.";

    @Autowired private TareaDiario tareaDiario;

    // ------------------------------------------------------------------ ayudas

    private JsonNode llamar(long usuario, MockHttpServletRequestBuilder req, Object cuerpo) throws Exception {
        req.contextPath("/biblioteca").header("Authorization", bearer(usuario)).contentType(MediaType.APPLICATION_JSON);
        if (cuerpo != null) req.content(cuerpo instanceof String s ? s : json.writeValueAsString(cuerpo));
        MvcResult r = mvc.perform(req).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
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

    private static void soloRegistro(JsonNode r) {
        error(r, 120);
        assertThat(r.get("message").asText()).isEqualTo(SOLO_REGISTRO);
    }

    private static JsonNode bien(JsonNode r) {
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        return r.get("object");
    }

    private int filas(String tabla) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + tabla, Integer.class);
    }

    private String estado(String ejemplar) throws Exception {
        return pedir(ANDERSON, "/v1/libros/get/" + ejemplar).get("object").get("estado").asText();
    }

    // ------------------------------------------------------------------ C9

    @Nested
    @DisplayName("Diario del reproductor (C9)")
    class Diario {

        private Map<String, Object> evento(String tipo, Object ejemplar) {
            Map<String, Object> e = mapa("cuando", "2026-11-25T21:03:11.120Z", "tipo", tipo, "capitulo", 3,
                    "posicion", 812.4, "detalle", "texto corto",
                    "contexto", mapa("standalone", true, "cinta", true, "visible", false, "red", true,
                            "ua", "Mozilla/5.0 (iPhone)", "version", "0.5.0"));
            if (ejemplar != null) e.put("ejemplarId", ejemplar);
            return e;
        }

        private JsonNode enviar(long usuario, List<?> eventos) throws Exception {
            return pedir(usuario, "/v1/diario", mapa("eventos", eventos));
        }

        private List<Object> lote(int n) {
            List<Object> l = new ArrayList<>();
            for (int i = 0; i < n; i++) l.add(evento("reanuda", null));
            return l;
        }

        @Test
        @DisplayName("guarda el lote con el usuario del token; ejemplar ajeno o inexistente -> null; contexto en jsonb")
        void guarda() throws Exception {
            String mio = subirLibro(ANDERSON, "mio.epub").get("id").asText();
            String ajeno = subirLibro(SAMY, "ajeno.epub").get("id").asText();
            JsonNode r = bien(enviar(ANDERSON, List.of(evento("atasco", mio), evento("pausa-sistema", ajeno),
                    evento("error-red", UUID.randomUUID().toString()), evento("inicio", null))));
            assertThat(r.get("guardados").asInt()).isEqualTo(4);

            assertThat(jdbc.queryForList("SELECT DISTINCT usuario_id FROM bah_lib_diario", Long.class))
                    .containsExactly(ANDERSON);
            assertThat(jdbc.queryForList("SELECT tipo || ':' || COALESCE(ejemplar_id::text, '-') FROM bah_lib_diario "
                    + "ORDER BY tipo", String.class))
                    .containsExactly("atasco:" + mio, "error-red:-", "inicio:-", "pausa-sistema:-");
            Map<String, Object> fila = jdbc.queryForMap("SELECT cuando, capitulo, posicion, detalle, "
                    + "contexto->>'ua' AS ua, (contexto->>'cinta')::boolean AS cinta FROM bah_lib_diario WHERE tipo = 'atasco'");
            assertThat(((java.sql.Timestamp) fila.get("cuando")).toInstant()).isEqualTo(Instant.parse("2026-11-25T21:03:11.120Z"));
            assertThat(fila.get("capitulo")).isEqualTo(3);
            assertThat(fila.get("posicion")).isEqualTo(812.4);
            assertThat(fila.get("detalle")).isEqualTo("texto corto");
            assertThat(fila.get("ua")).isEqualTo("Mozilla/5.0 (iPhone)");
            assertThat(fila.get("cinta")).isEqualTo(true);
        }

        @Test
        @DisplayName("lo minimo basta (cuando y tipo); detalle en blanco se guarda como null")
        void minimo() throws Exception {
            JsonNode r = bien(enviar(ANDERSON, List.of(mapa("cuando", "2026-11-25T21:03:11Z", "tipo", "oculta",
                    "detalle", "  "))));
            assertThat(r.get("guardados").asInt()).isEqualTo(1);
            assertThat(jdbc.queryForMap("SELECT capitulo, posicion, detalle, contexto, ejemplar_id FROM bah_lib_diario"))
                    .containsEntry("capitulo", null).containsEntry("posicion", null).containsEntry("detalle", null)
                    .containsEntry("contexto", null).containsEntry("ejemplar_id", null);
        }

        @Test
        @DisplayName("fuera de limites -> 120 y no se guarda nada del lote")
        void limites() throws Exception {
            error(enviar(ANDERSON, List.of()), 120);
            error(enviar(ANDERSON, lote(51)), 120);
            error(pedir(ANDERSON, "/v1/diario", "{}"), 120);
            error(pedir(ANDERSON, "/v1/diario", mapa("eventos", java.util.Arrays.asList(evento("inicio", null), null))), 120);
            Map<String, Object> mayusculas = evento("Atasco", null);
            Map<String, Object> espacio = evento("a b", null);
            Map<String, Object> largo = evento("a".repeat(41), null);
            Map<String, Object> sinCuando = evento("inicio", null);
            sinCuando.remove("cuando");
            Map<String, Object> sinTipo = evento("inicio", null);
            sinTipo.remove("tipo");
            Map<String, Object> detalle = evento("inicio", null);
            detalle.put("detalle", "d".repeat(501));
            Map<String, Object> capitulo = evento("inicio", null);
            capitulo.put("capitulo", -1);
            Map<String, Object> posicion = evento("inicio", null);
            posicion.put("posicion", -0.5);
            Map<String, Object> ua = evento("inicio", null);
            ua.put("contexto", mapa("ua", "u".repeat(201)));
            Map<String, Object> anidado = evento("inicio", null);
            anidado.put("contexto", mapa("red", mapa("tipo", "wifi")));
            Map<String, Object> lista = evento("inicio", null);
            lista.put("contexto", mapa("redes", List.of("wifi")));
            Map<String, Object> grande = evento("inicio", null);
            grande.put("contexto", mapa("a", "x".repeat(1000), "b", "y".repeat(1000), "c", "z".repeat(100)));
            Map<String, Object> noObjeto = evento("inicio", null);
            noObjeto.put("contexto", "texto");
            for (Map<String, Object> malo : List.of(mayusculas, espacio, largo, sinCuando, sinTipo, detalle, capitulo,
                    posicion, ua, anidado, lista, grande, noObjeto)) {
                error(enviar(ANDERSON, List.of(evento("inicio", null), malo)), 120);
            }
            JsonNode mensaje = enviar(ANDERSON, List.of(evento("inicio", null), anidado));
            assertThat(mensaje.get("message").asText()).isEqualTo("El contexto del evento 1 del diario debe ser un "
                    + "objeto plano (solo textos, números, sí/no o vacíos; sin objetos ni listas dentro) de hasta 2048 "
                    + "bytes, con \"ua\" de hasta 200 caracteres.");
            assertThat(filas("bah_lib_diario")).isZero();

            Map<String, Object> justo = evento("a-0".repeat(13) + "z", null);
            justo.put("detalle", "d".repeat(500));
            justo.put("contexto", mapa("ua", "u".repeat(200)));
            assertThat(bien(enviar(ANDERSON, List.of(justo))).get("guardados").asInt()).as("40 y 500 justos").isEqualTo(1);
            assertThat(bien(enviar(ANDERSON, lote(50))).get("guardados").asInt()).isEqualTo(50);
        }

        @Test
        @DisplayName("sin sesion: 401 y nada guardado")
        void sinSesion() throws Exception {
            MvcResult r = mvc.perform(post("/biblioteca/v1/diario").contextPath("/biblioteca")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(mapa("eventos", List.of(evento("inicio", null)))))).andReturn();
            assertThat(r.getResponse().getStatus()).isEqualTo(401);
            assertThat(filas("bah_lib_diario")).isZero();
        }

        @Test
        @DisplayName("tope de 600 por usuario y hora: lo de mas se descarta en silencio y guardados dice lo real")
        void tope() throws Exception {
            long usuario = 7L; // un usuario solo para esta prueba: el tope vive en memoria una hora
            for (int i = 0; i < 12; i++) {
                assertThat(bien(enviar(usuario, lote(49))).get("guardados").asInt()).isEqualTo(49);
            }
            JsonNode parcial = enviar(usuario, lote(50));
            assertThat(bien(parcial).get("guardados").asInt()).as("588 + 12 = 600").isEqualTo(12);
            assertThat(bien(enviar(usuario, lote(5))).get("guardados").asInt()).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_diario WHERE usuario_id = ?", Integer.class,
                    usuario)).isEqualTo(600);
            assertThat(bien(enviar(ANDERSON, lote(3))).get("guardados").asInt()).as("cada usuario con su tope").isEqualTo(3);
        }

        @Test
        @DisplayName("cada evento deja una linea INFO 'diario usuario=... tipo=... cap=... pos=... detalle=...' de una sola linea")
        void lineaDeLog() throws Exception {
            Logger logger = (Logger) LoggerFactory.getLogger(DiarioServiceImpl.class);
            Level antes = logger.getLevel();
            ListAppender<ILoggingEvent> lineas = new ListAppender<>();
            lineas.start();
            logger.addAppender(lineas);
            logger.setLevel(Level.INFO);
            try {
                Map<String, Object> e = evento("atasco", null);
                e.put("detalle", "sin avanzar\nFALSO linea");
                bien(enviar(ANDERSON, List.of(e)));
            } finally {
                logger.setLevel(antes);
                logger.detachAppender(lineas);
            }
            assertThat(lineas.list).extracting(ILoggingEvent::getFormattedMessage)
                    .containsExactly("diario usuario=1 tipo=atasco cap=3 pos=812.4 detalle=sin avanzar FALSO linea");
            assertThat(lineas.list.get(0).getLevel()).isEqualTo(Level.INFO);
        }

        @Test
        @DisplayName("la tarea diaria borra lo creado hace mas de 30 dias y deja lo demas")
        void retencion() throws Exception {
            bien(enviar(ANDERSON, lote(2)));
            jdbc.update("INSERT INTO bah_lib_diario (id, usuario_id, cuando, tipo, creado_en) VALUES "
                    + "(?, 1, now(), 'viejo', now() - interval '31 days'), (?, 2, now(), 'casi', now() - interval '29 days')",
                    UUID.randomUUID(), UUID.randomUUID());
            tareaDiario.revisar();
            assertThat(jdbc.queryForList("SELECT tipo FROM bah_lib_diario ORDER BY tipo", String.class))
                    .containsExactly("casi", "reanuda", "reanuda");
        }
    }

    // ------------------------------------------------------------------ C10.1

    @Nested
    @DisplayName("POR_LEER pasa a LEYENDO solo si el progreso avanza de verdad (C10.1)")
    class AutoLeyendo {

        private String id;

        @BeforeEach
        void libro() throws Exception {
            id = subirLibro(ANDERSON, "leyendo.epub").get("id").asText();
        }

        /* Como la web y el lector: cada guardado lleva su hora y va despues del anterior. Sin ella manda el
           reloj del servidor, y dos guardados seguidos podian empatar o desordenarse (prueba intermitente). */
        private Instant hora = Instant.now().minus(1, ChronoUnit.HOURS);

        private void progreso(Object... kv) throws Exception {
            Map<String, Object> p = mapa(kv);
            p.put("ejemplarId", id);
            hora = hora.plusSeconds(1);
            p.putIfAbsent("actualizadoEn", hora.toString());
            bien(pedir(ANDERSON, "/v1/progreso/save", p));
        }

        @Test
        @DisplayName("sin progreso previo, abrir con 0/0 (o sin nada) no lo mete en Leyendo; avanzar si")
        void sinPrevio() throws Exception {
            progreso("capitulo", 0, "porcentaje", 0.0);
            assertThat(estado(id)).isEqualTo("POR_LEER");
            progreso("modo", "VOZ");
            assertThat(estado(id)).as("sin capitulo ni porcentaje = 0/0").isEqualTo("POR_LEER");
            progreso("capitulo", 0, "porcentaje", 0.5);
            assertThat(estado(id)).isEqualTo("LEYENDO");
        }

        @Test
        @DisplayName("sin progreso previo, un capitulo > 0 ya es avance")
        void capituloPrimero() throws Exception {
            progreso("capitulo", 2, "porcentaje", 0.0);
            assertThat(estado(id)).isEqualTo("LEYENDO");
        }

        @Test
        @DisplayName("con progreso previo: el mismo punto (o + 0,001) no; otro capitulo o mas porcentaje si")
        void conPrevio() throws Exception {
            progreso("capitulo", 3, "porcentaje", 20.0);
            bien(pedir(ANDERSON, "/v1/libros/save", mapa("id", id, "estado", "POR_LEER")));
            progreso("capitulo", 3, "porcentaje", 20.0);
            assertThat(estado(id)).as("mismo punto").isEqualTo("POR_LEER");
            progreso("capitulo", 3, "porcentaje", 20.0005);
            assertThat(estado(id)).as("ruido de redondeo").isEqualTo("POR_LEER");
            progreso("capitulo", 3, "porcentaje", 19.0);
            assertThat(estado(id)).as("retroceder no es avanzar").isEqualTo("POR_LEER");
            progreso("capitulo", 4, "porcentaje", 19.0);
            assertThat(estado(id)).as("otro capitulo").isEqualTo("LEYENDO");

            bien(pedir(ANDERSON, "/v1/libros/save", mapa("id", id, "estado", "POR_LEER")));
            progreso("capitulo", 4, "porcentaje", 19.5);
            assertThat(estado(id)).as("mas porcentaje").isEqualTo("LEYENDO");
        }

        @Test
        @DisplayName("LEIDO y ABANDONADO nunca cambian solos, aunque el progreso avance")
        void terminados() throws Exception {
            for (String fijo : List.of("LEIDO", "ABANDONADO")) {
                bien(pedir(ANDERSON, "/v1/libros/save", mapa("id", id, "estado", fijo)));
                progreso("capitulo", fijo.length(), "porcentaje", 50.0 + fijo.length());
                assertThat(estado(id)).isEqualTo(fijo);
            }
        }
    }

    // ------------------------------------------------------------------ C10.2

    @Nested
    @DisplayName("Preparar desde donde vas (C10.2)")
    class PrepararDesde {

        private String id;
        private UUID archivo;

        @BeforeEach
        void libro() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "desde.epub");
            id = e.get("id").asText();
            archivo = uuid(e.get("archivoId"));
            marcarListo(archivo, 6, "{}");
            escribir(DATOS.resolve("normalizados/" + archivo + "/estructura.json"),
                    Mejoras040Test.ESTRUCTURA_V2.getBytes(StandardCharsets.UTF_8));
        }

        private JsonNode preparar(Object desde) throws Exception {
            Map<String, Object> cuerpo = mapa("ejemplarId", id, "vozId", VOZ);
            if (desde != null) cuerpo.put("desdeCapitulo", desde);
            return pedir(ANDERSON, "/v1/voz/preparar-libro", cuerpo);
        }

        /** El orden en que el taller los tomaria: ORDER BY prioridad, creado (taller/app/cola/repositorio.py). */
        private List<Integer> ordenDelTaller() {
            return jdbc.queryForList("SELECT (payload->>'capitulo')::int FROM bah_lib_trabajo WHERE estado = 'PENDIENTE' "
                    + "AND tipo = 'VOZ_CAPITULO' ORDER BY prioridad, creado", Integer.class);
        }

        private int voz() {
            return jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'", Integer.class);
        }

        @Test
        @DisplayName("con desdeCapitulo: de ese al final y luego los anteriores, con creado distinto y creciente")
        void desdeElPedido() throws Exception {
            assertThat(bien(preparar(3)).get("encolados").asInt()).isEqualTo(4);
            assertThat(ordenDelTaller()).containsExactly(3, 5, 1, 2);
            assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT creado) FROM bah_lib_trabajo WHERE tipo = 'VOZ_CAPITULO'", Integer.class))
                    .as("sin empates: el orden no depende del azar").isEqualTo(4);
        }

        @Test
        @DisplayName("sin desdeCapitulo: desde el capitulo del progreso; sin progreso, desde el principio")
        void desdeElProgreso() throws Exception {
            bien(preparar(null));
            assertThat(ordenDelTaller()).containsExactly(1, 2, 3, 5);
            jdbc.update("DELETE FROM bah_lib_trabajo");
            bien(pedir(ANDERSON, "/v1/progreso/save", mapa("ejemplarId", id, "capitulo", 2, "porcentaje", 30.0)));
            bien(preparar(null));
            assertThat(ordenDelTaller()).containsExactly(2, 3, 5, 1);
        }

        @Test
        @DisplayName("volver a preparar desde otro capitulo recoloca lo que ya esperaba (sin duplicar); "
                + "desdeCapitulo despues del ultimo = todo en orden")
        void recoloca() throws Exception {
            bien(preparar(0));
            JsonNode otra = bien(preparar(5));
            assertThat(otra.get("encolados").asInt()).isZero();
            assertThat(otra.get("enCola").asInt()).isEqualTo(4);
            assertThat(ordenDelTaller()).containsExactly(5, 1, 2, 3);
            bien(preparar(99));
            assertThat(ordenDelTaller()).containsExactly(1, 2, 3, 5);
            assertThat(voz()).isEqualTo(4);
        }

        @Test
        @DisplayName("los listos y los en error no cuentan; lo pedido para escuchar (10) sigue delante")
        void prioridades() throws Exception {
            jdbc.update("INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg) VALUES "
                    + "(?, ?, 3, 'LISTO', 30)", archivo, VOZ);
            bien(pedir(ANDERSON, "/v1/audio/estado", mapa("ejemplarId", id, "vozId", VOZ, "capitulo", 1)));
            bien(preparar(2));
            assertThat(ordenDelTaller()).as("el 1 pedido (10), luego 2 y 5 (40)").containsExactly(1, 2, 5);
        }

        @Test
        @DisplayName("desdeCapitulo negativo -> 120 y nada encolado")
        void negativo() throws Exception {
            error(preparar(-1), 120);
            error(preparar("tres"), 120);
            assertThat(voz()).isZero();
        }
    }

    // ------------------------------------------------------------------ C11

    @Nested
    @DisplayName("Libros solo registro (C11)")
    class SoloRegistro {

        private JsonNode registrar(long usuario, Object... kv) throws Exception {
            return pedir(usuario, "/v1/libros/registro", mapa(kv));
        }

        private List<String> titulos(Object... filtro) throws Exception {
            List<String> t = new ArrayList<>();
            bien(pedir(ANDERSON, "/v1/libros/all", mapa(filtro))).get("list").forEach(n -> t.add(n.get("titulo").asText()));
            return t;
        }

        @Test
        @DisplayName("por defecto LEIDO, sin fecha de fin inventada; tipo LIBRO, sinArchivo, una lectura")
        void porDefecto() throws Exception {
            JsonNode e = bien(registrar(ANDERSON, "titulo", "  Cien años de soledad ",
                    "autores", List.of("Gabriel García Márquez", " ", "gabriel garcía márquez")));
            assertThat(e.get("titulo").asText()).isEqualTo("Cien años de soledad");
            assertThat(e.get("autores")).extracting(JsonNode::asText).containsExactly("Gabriel García Márquez");
            assertThat(e.get("tipo").asText()).isEqualTo("LIBRO");
            assertThat(e.get("estado").asText()).isEqualTo("LEIDO");
            assertThat(e.get("sinArchivo").asBoolean()).isTrue();
            assertThat(e.get("archivoId").isNull()).isTrue();
            assertThat(e.get("fechaFin").isNull()).isTrue();
            assertThat(e.get("tienePortada").asBoolean()).isFalse();
            assertThat(e.get("fuenteMetadatos").asText()).isEqualTo("MANUAL");
            assertThat(jdbc.queryForObject("SELECT veces_leido FROM bah_lib_ejemplar WHERE id = ?::uuid", Integer.class,
                    e.get("id").asText())).isEqualTo(1);
        }

        @Test
        @DisplayName("con fecha de fin, calificacion y nota; tambien POR_LEER, LEYENDO y ABANDONADO")
        void completo() throws Exception {
            JsonNode e = bien(registrar(ANDERSON, "titulo", "Rayuela", "estado", "LEIDO",
                    "fechaFin", "2024-03-15T00:00:00Z", "calificacion", 4.5, "nota", "Lo leí en el colegio"));
            assertThat(java.time.OffsetDateTime.parse(e.get("fechaFin").asText()).toInstant())
                    .isEqualTo(Instant.parse("2024-03-15T00:00:00Z"));
            assertThat(e.get("calificacion").asDouble()).isEqualTo(4.5);
            assertThat(e.get("nota").asText()).isEqualTo("Lo leí en el colegio");
            assertThat(bien(registrar(ANDERSON, "titulo", "Pendiente", "estado", "POR_LEER")).get("estado").asText())
                    .isEqualTo("POR_LEER");
            assertThat(bien(registrar(ANDERSON, "titulo", "Dejado", "estado", "ABANDONADO")).get("estado").asText())
                    .isEqualTo("ABANDONADO");
            JsonNode leyendo = bien(registrar(ANDERSON, "titulo", "En papel", "estado", "LEYENDO"));
            assertThat(leyendo.get("estado").asText()).isEqualTo("LEYENDO");
            assertThat(jdbc.queryForObject("SELECT fecha_inicio IS NOT NULL FROM bah_lib_ejemplar WHERE id = ?::uuid",
                    Boolean.class, leyendo.get("id").asText())).isTrue();
        }

        @Test
        @DisplayName("titulo vacio, fecha de fin sin LEIDO o futura, calificacion invalida -> 120 y nada creado")
        void invalidos() throws Exception {
            error(registrar(ANDERSON, "titulo", " "), 120);
            error(registrar(ANDERSON, "autores", List.of("Nadie")), 120);
            error(registrar(ANDERSON, "titulo", "x".repeat(501)), 120);
            error(registrar(ANDERSON, "titulo", "X", "nota", "n".repeat(2001)), 120);
            error(registrar(ANDERSON, "titulo", "X", "estado", "QUIZAS"), 120);
            JsonNode sinLeido = registrar(ANDERSON, "titulo", "X", "estado", "POR_LEER", "fechaFin", "2024-01-01T00:00:00Z");
            error(sinLeido, 120);
            assertThat(sinLeido.get("message").asText())
                    .isEqualTo("La fecha de fin solo vale para un libro leído y no puede ser futura.");
            error(registrar(ANDERSON, "titulo", "X", "fechaFin", Instant.now().plus(3, ChronoUnit.DAYS).toString()), 120);
            error(registrar(ANDERSON, "titulo", "X", "calificacion", 4.3), 120);
            assertThat(filas("bah_lib_ejemplar")).isZero();
            assertThat(filas("bah_lib_obra")).isZero();
        }

        @Test
        @DisplayName("sale en las pestanas de libros, en facetas (sin formato) y no rompe los libros con archivo")
        void pestanasYFacetas() throws Exception {
            JsonNode conArchivo = subirLibro(ANDERSON, "con.epub");
            bien(pedir(ANDERSON, "/v1/libros/save", mapa("id", conArchivo.get("id").asText(), "titulo", "Con archivo",
                    "autores", List.of("Cortázar"), "estado", "LEIDO")));
            bien(registrar(ANDERSON, "titulo", "Registro leido", "autores", List.of("Cortázar")));
            bien(registrar(ANDERSON, "titulo", "Registro pendiente", "estado", "POR_LEER"));
            bien(registrar(ANDERSON, "titulo", "Registro leyendo", "estado", "LEYENDO"));
            bien(pedir(ANDERSON, "/v1/libros/deseo", mapa("titulo", "Un deseo")));

            assertThat(titulos("pestana", "LEIDOS", "orden", "TITULO")).containsExactly("Con archivo", "Registro leido");
            assertThat(titulos("pestana", "POR_LEER")).containsExactly("Registro pendiente");
            assertThat(titulos("pestana", "LEYENDO")).containsExactly("Registro leyendo");
            assertThat(titulos("pestana", "TODO", "orden", "TITULO"))
                    .containsExactly("Con archivo", "Registro leido", "Registro leyendo", "Registro pendiente");
            assertThat(titulos("pestana", "DESEOS")).containsExactly("Un deseo");
            assertThat(titulos("pestana", "TODO", "formatos", List.of("EPUB"))).containsExactly("Con archivo");
            assertThat(titulos("pestana", "TODO", "texto", "registro", "orden", "TITULO"))
                    .containsExactly("Registro leido", "Registro leyendo", "Registro pendiente");

            JsonNode lista = bien(pedir(ANDERSON, "/v1/libros/all", mapa("pestana", "LEIDOS", "orden", "TITULO"))).get("list");
            assertThat(lista.get(0).get("sinArchivo").asBoolean()).as("con archivo").isFalse();
            assertThat(lista.get(1).get("sinArchivo").asBoolean()).isTrue();

            JsonNode facetas = bien(pedir(ANDERSON, "/v1/libros/facetas", mapa("pestana", "LEIDOS")));
            assertThat(facetas.get("autores")).singleElement().satisfies(a -> {
                assertThat(a.get("nombre").asText()).isEqualTo("Cortázar");
                assertThat(a.get("n").asLong()).isEqualTo(2);
            });
            assertThat(facetas.get("formatos")).singleElement()
                    .satisfies(f -> assertThat(f.get("n").asLong()).isEqualTo(1));
        }

        @Test
        @DisplayName("ficha, edicion, progreso, sesiones, favoritos y borrado funcionan sin archivo")
        void loQueSiFunciona() throws Exception {
            String id = bien(registrar(ANDERSON, "titulo", "Papel", "estado", "POR_LEER")).get("id").asText();
            JsonNode ficha = bien(pedir(ANDERSON, "/v1/libros/get/" + id));
            assertThat(ficha.get("capitulos")).isEmpty();
            assertThat(ficha.get("sinArchivo").asBoolean()).isTrue();
            JsonNode editado = bien(pedir(ANDERSON, "/v1/libros/save", mapa("id", id, "estado", "LEIDO",
                    "calificacion", 3.0, "favorito", true, "etiquetas", List.of("papel"))));
            assertThat(editado.get("estado").asText()).isEqualTo("LEIDO");
            assertThat(editado.get("favorito").asBoolean()).isTrue();
            assertThat(titulos("pestana", "FAVORITOS")).containsExactly("Papel");
            bien(pedir(ANDERSON, "/v1/progreso/save", mapa("ejemplarId", id, "capitulo", 1, "porcentaje", 50.0)));
            bien(pedir(ANDERSON, "/v1/sesiones/latido", mapa("ejemplarId", id, "modo", "LECTURA", "segundos", 60)));
            bien(llamar(ANDERSON, get("/biblioteca/v1/sesiones/resumen"), null));

            assertThat(bien(pedir(ANDERSON, "/v1/libros/delete/" + id)).asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar WHERE id = ?::uuid", Integer.class, id))
                    .as("se borra de verdad: no hay archivo con el que reencontrarlo").isZero();
            assertThat(filas("bah_lib_obra")).isZero();
        }

        @Test
        @DisplayName("todo lo que necesita el archivo responde 120 'es solo registro' (nunca 500) y no encola nada")
        void blindado() throws Exception {
            String id = bien(registrar(ANDERSON, "titulo", "Papel", "estado", "LEYENDO")).get("id").asText();
            soloRegistro(pedir(ANDERSON, "/v1/audio/estado", mapa("ejemplarId", id, "vozId", VOZ, "capitulo", 0)));
            soloRegistro(pedir(ANDERSON, "/v1/voz/preparar-libro", mapa("ejemplarId", id, "vozId", VOZ)));
            soloRegistro(pedir(ANDERSON, "/v1/voz/preparar-libro", mapa("ejemplarId", id, "vozId", VOZ, "desdeCapitulo", 2)));
            soloRegistro(llamar(ANDERSON, get("/biblioteca/v1/voz/preparar-libro").param("ejemplarId", id)
                    .param("vozId", VOZ), null));
            soloRegistro(llamar(ANDERSON, put("/biblioteca/v1/ejemplares/" + id + "/capitulos/0/voz"), mapa("enVoz", true)));
            soloRegistro(llamar(ANDERSON, put("/biblioteca/v1/ejemplares/" + id + "/capitulos/voz"),
                    mapa("soloHistoria", true)));
            soloRegistro(llamar(ANDERSON, get("/biblioteca/v1/ejemplares/" + id + "/pronunciacion"), null));
            soloRegistro(llamar(ANDERSON, put("/biblioteca/v1/ejemplares/" + id + "/pronunciacion"),
                    List.of(mapa("de", "Hermione", "a", "Jermáyoni"))));
            soloRegistro(pedir(ANDERSON, "/v1/traducir/capitulo", mapa("ejemplarId", id, "capitulo", 0, "destino", "es")));
            assertThat(filas("bah_lib_trabajo")).isZero();
            assertThat(filas("bah_lib_pronunciacion")).isZero();
            assertThat(filas("bah_lib_capitulo_voz")).isZero();

            String deseo = bien(pedir(ANDERSON, "/v1/libros/deseo", mapa("titulo", "Deseo"))).get("id").asText();
            JsonNode r = pedir(ANDERSON, "/v1/audio/estado", mapa("ejemplarId", deseo, "vozId", VOZ, "capitulo", 0));
            error(r, 120);
            assertThat(r.get("message").asText()).as("el deseo conserva su mensaje").isEqualTo("Este libro no tiene archivo.");
        }

        @Test
        @DisplayName("un registro no cumple deseos ni es de nadie mas")
        void aislado() throws Exception {
            String id = bien(registrar(ANDERSON, "titulo", "Mio")).get("id").asText();
            error(pedir(SAMY, "/v1/libros/get/" + id), 102);
            error(pedir(SAMY, "/v1/voz/preparar-libro", mapa("ejemplarId", id, "vozId", VOZ)), 102);
            assertThat(bien(pedir(SAMY, "/v1/libros/all", mapa("pestana", "LEIDOS"))).get("totalElements").asLong()).isZero();
            JsonNode r = json.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                    .multipart("/biblioteca/v1/libros/subir")
                    .file(new org.springframework.mock.web.MockMultipartFile("archivos", "mio.epub",
                            "application/octet-stream", epub("mio.epub")))
                    .param("deseoId", id).contextPath("/biblioteca").header("Authorization", bearer(ANDERSON)))
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
            error(r, 120);
            assertThat(r.get("message").asText()).isEqualTo("Ese libro ya no está en tu lista de deseos.");
        }
    }
}
