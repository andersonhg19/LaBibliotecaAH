package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.TraductorFalso;
import com.bibliotecaah.biblioteca.service.impl.TareaCacheDeTraducciones;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Traduccion autoalojada (contratos v1.3) contra un LibreTranslate de mentira (TraductorFalso):
 * textos sueltos con cache y freno, y capitulos frase a frase con su fichero compartido, la
 * propiedad del ejemplar y el trabajo en segundo plano.
 *
 * En application.properties de pruebas: capitulos de mas de 200 caracteres van en segundo plano,
 * lotes de 3 frases, 12 000 caracteres por minuto, 1 hilo y cola de 2.
 */
@DisplayName("Traduccion: textos sueltos y capitulos")
class TraduccionTest extends PostgresDeVerdad {

    private static final String NO_DISPONIBLE = "El traductor no está disponible ahora mismo. Inténtalo de nuevo "
            + "en unos minutos; la lectura sigue funcionando.";

    @Autowired private TareaCacheDeTraducciones tareaCache;

    private JsonNode traducir(long usuario, Map<String, Object> cuerpo) throws Exception {
        return pedir(usuario, "/v1/traducir", cuerpo);
    }

    @Nested
    @DisplayName("POST /v1/traducir")
    class TextoSuelto {

        @Test
        @DisplayName("sin origen ni destino: auto -> es, con el idioma detectado")
        void porDefecto() throws Exception {
            JsonNode r = traducir(ANDERSON, Map.of("texto", "It was a cold day."));

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.at("/object/traduccion").asText()).isEqualTo("[es] It was a cold day.");
            assertThat(r.at("/object/origenDetectado").asText()).isEqualTo("en");
            JsonNode enviada = TRADUCTOR.peticiones().get(0);
            assertThat(enviada.get("source").asText()).isEqualTo("auto");
            assertThat(enviada.get("target").asText()).isEqualTo("es");
            assertThat(enviada.get("format").asText()).isEqualTo("text");
            assertThat(enviada.get("q").get(0).asText()).isEqualTo("It was a cold day.");
        }

        @Test
        @DisplayName("con origen en: se pide en y se devuelve en; mayusculas y espacios no importan")
        void origenExplicito() throws Exception {
            JsonNode r = traducir(ANDERSON, Map.of("texto", "Hello.", "origen", " EN ", "destino", "es"));

            assertThat(r.at("/object/origenDetectado").asText()).isEqualTo("en");
            assertThat(TRADUCTOR.peticiones().get(0).get("source").asText()).isEqualTo("en");
        }

        @Test
        @DisplayName("lo ya traducido sale de la cache: el traductor no se vuelve a llamar, y no se guarda de quien era")
        void cache() throws Exception {
            traducir(ANDERSON, Map.of("texto", "The same sentence."));
            JsonNode otra = traducir(SAMY, Map.of("texto", "The same sentence."));

            assertThat(otra.at("/object/traduccion").asText()).isEqualTo("[es] The same sentence.");
            assertThat(otra.at("/object/origenDetectado").asText()).isEqualTo("en");
            assertThat(TRADUCTOR.peticiones()).hasSize(1);
            assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns "
                    + "WHERE table_name = 'bah_lib_traduccion'", String.class))
                    .containsExactlyInAnyOrder("hash", "origen", "destino", "traduccion", "origen_detectado",
                            "creado", "usado");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_traduccion", Integer.class)).isEqualTo(1);
        }

        @Test
        @DisplayName("el mismo texto con otro origen es otra entrada de la cache")
        void cachePorParDeIdiomas() throws Exception {
            traducir(ANDERSON, Map.of("texto", "Hola."));
            traducir(ANDERSON, Map.of("texto", "Hola.", "origen", "en"));

            assertThat(TRADUCTOR.peticiones()).hasSize(2);
        }

        @Test
        @DisplayName("de 1 a 5000 caracteres: vacio, solo espacios o 5001 dan 120; 5000 justos pasan")
        void largo() throws Exception {
            assertThat(traducir(ANDERSON, Map.of("texto", "")).get("errorCode").asInt()).isEqualTo(120);
            assertThat(traducir(ANDERSON, Map.of("texto", "   ")).get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/traducir", "{}").get("message").asText())
                    .isEqualTo("Revisa los datos enviados: texto es obligatorio.");
            JsonNode largo = traducir(ANDERSON, Map.of("texto", "a".repeat(5001)));
            assertThat(largo.get("errorCode").asInt()).isEqualTo(120);
            assertThat(largo.get("message").asText())
                    .isEqualTo("Revisa los datos enviados: texto no puede superar los 5000 caracteres.");
            assertThat(TRADUCTOR.peticiones()).isEmpty();

            assertThat(traducir(ANDERSON, Map.of("texto", "b".repeat(5000))).get("correct").asBoolean()).isTrue();
        }

        @Test
        @DisplayName("idiomas fuera de los cargados, o el mismo de origen y destino: 120 con mensaje")
        void idiomas() throws Exception {
            JsonNode fr = traducir(ANDERSON, Map.of("texto", "Bonjour.", "origen", "fr"));
            assertThat(fr.get("errorCode").asInt()).isEqualTo(120);
            assertThat(fr.get("message").asText())
                    .isEqualTo("El idioma \"fr\" no está disponible para traducir. Se admiten: auto, en, es.");

            JsonNode destino = traducir(ANDERSON, Map.of("texto", "Hola.", "destino", "de"));
            assertThat(destino.get("message").asText())
                    .isEqualTo("El idioma \"de\" no está disponible para traducir. Se admiten: en, es.");

            JsonNode auto = traducir(ANDERSON, Map.of("texto", "Hola.", "destino", "auto"));
            assertThat(auto.get("errorCode").asInt()).isEqualTo(120);

            JsonNode mismo = traducir(ANDERSON, Map.of("texto", "Hello.", "origen", "en", "destino", "en"));
            assertThat(mismo.get("errorCode").asInt()).isEqualTo(120);
            assertThat(mismo.get("message").asText()).isEqualTo("El texto ya está en el idioma de destino (\"en\").");

            JsonNode raro = traducir(ANDERSON, Map.of("texto", "x", "origen", "klingonisch"));
            assertThat(raro.get("message").asText())
                    .isEqualTo("Revisa los datos enviados: origen no puede superar los 10 caracteres.");
            assertThat(TRADUCTOR.peticiones()).isEmpty();
        }

        @Test
        @DisplayName("traductor caido o con respuesta rara: 503 con mensaje claro y nada en la cache")
        void caido() throws Exception {
            TRADUCTOR.modo(TraductorFalso.Modo.ERROR_500);
            JsonNode r = traducir(ANDERSON, Map.of("texto", "Hello."));
            assertThat(r.get("correct").asBoolean()).isFalse();
            assertThat(r.get("errorCode").asInt()).isEqualTo(503);
            assertThat(r.get("message").asText()).isEqualTo(NO_DISPONIBLE);

            TRADUCTOR.modo(TraductorFalso.Modo.BASURA);
            assertThat(traducir(ANDERSON, Map.of("texto", "Hello.")).get("errorCode").asInt()).isEqualTo(503);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_traduccion", Integer.class)).isZero();

            TRADUCTOR.modo(TraductorFalso.Modo.BIEN);
            assertThat(traducir(ANDERSON, Map.of("texto", "Hello.")).get("correct").asBoolean()).isTrue();
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of()).get("correct").asBoolean())
                    .as("el resto de la API sigue respondiendo").isTrue();
        }

        @Test
        @DisplayName("freno por usuario: 12 000 caracteres por minuto -> 429; la cache y el otro usuario no cuentan")
        void limite() throws Exception {
            long usuario = 77;
            assertThat(traducir(usuario, Map.of("texto", "a".repeat(5000))).get("correct").asBoolean()).isTrue();
            assertThat(traducir(usuario, Map.of("texto", "b".repeat(5000))).get("correct").asBoolean()).isTrue();

            JsonNode tercero = traducir(usuario, Map.of("texto", "c".repeat(5000)));
            assertThat(tercero.get("errorCode").asInt()).isEqualTo(429);
            assertThat(tercero.get("message").asText()).isEqualTo("Has traducido mucho texto en poco tiempo "
                    + "(12000 caracteres por minuto como máximo). Espera un momento y vuelve a intentarlo.");

            assertThat(traducir(usuario, Map.of("texto", "a".repeat(5000))).get("correct").asBoolean())
                    .as("lo que ya esta en cache no gasta").isTrue();
            assertThat(traducir(78, Map.of("texto", "c".repeat(5000))).get("correct").asBoolean())
                    .as("cada usuario tiene su cupo").isTrue();
            assertThat(TRADUCTOR.peticiones()).hasSize(3);
        }

        @Test
        @DisplayName("sin token: 401")
        void sinToken() throws Exception {
            mvc.perform(post("/biblioteca/v1/traducir").contextPath("/biblioteca")
                            .contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"Hello\"}"))
                    .andExpect(status().isUnauthorized());
            assertThat(TRADUCTOR.peticiones()).isEmpty();
        }

        @Test
        @DisplayName("la tarea diaria purga lo que lleva mas de 180 dias sin usarse")
        void purga() throws Exception {
            traducir(ANDERSON, Map.of("texto", "Old."));
            traducir(ANDERSON, Map.of("texto", "New."));
            jdbc.update("UPDATE bah_lib_traduccion SET usado = now() - interval '200 days' "
                    + "WHERE traduccion = '[es] Old.'");

            tareaCache.revisar();

            assertThat(jdbc.queryForList("SELECT traduccion FROM bah_lib_traduccion", String.class))
                    .containsExactly("[es] New.");
        }
    }

    @Nested
    @DisplayName("POST /v1/traducir/capitulo")
    class Capitulo {

        private String ejemplar;
        private UUID archivo;

        @BeforeEach
        void libroListo() throws Exception {
            JsonNode e = subirLibro(ANDERSON, "ingles.epub");
            ejemplar = e.get("id").asText();
            archivo = uuid(e.get("archivoId"));
            marcarListo(archivo, 6, "{}");
            // Capitulo 0: corto (< 200 caracteres), se traduce en la misma peticion.
            frases(0, List.of("Chapter One", "It rained.", "", "It rained."));
            // Capitulo 1: largo, en segundo plano. 8 frases, 2 repetidas, 1 vacia.
            frases(1, largo("Uno", 6));
        }

        private List<String> largo(String semilla, int n) {
            List<String> textos = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                textos.add(semilla + " sentence number " + i + " of a long chapter that goes on and on.");
            }
            textos.add(textos.get(0));
            textos.add("  ");
            return textos;
        }

        private void frases(int capitulo, List<String> textos) throws Exception {
            StringBuilder s = new StringBuilder("{\"capitulo\":" + capitulo + ",\"frases\":[");
            for (int i = 0; i < textos.size(); i++) {
                if (i > 0) s.append(',');
                s.append(json.writeValueAsString(Map.of("id", String.format("c%03d-s%05d", capitulo, i),
                        "texto", textos.get(i), "voz", textos.get(i), "finParrafo", false, "esTitulo", i == 0)));
            }
            s.append("]}");
            escribir(DATOS.resolve("normalizados/" + archivo + "/frases/" + String.format("cap-%03d.json", capitulo)),
                    s.toString().getBytes(StandardCharsets.UTF_8));
        }

        private JsonNode capitulo(long usuario, Object ejemplarId, int capitulo, Boolean reintentar) throws Exception {
            Map<String, Object> cuerpo = new HashMap<>(Map.of("ejemplarId", ejemplarId, "capitulo", capitulo,
                    "destino", "es"));
            if (reintentar != null) cuerpo.put("reintentar", reintentar);
            return pedir(usuario, "/v1/traducir/capitulo", cuerpo);
        }

        private JsonNode capitulo(int capitulo) throws Exception {
            return capitulo(ANDERSON, ejemplar, capitulo, null);
        }

        /** Pregunta hasta que el estado deja de ser PENDIENTE (como hara la web). */
        private JsonNode esperar(int capitulo) throws Exception {
            for (int i = 0; i < 200; i++) {
                JsonNode r = capitulo(capitulo);
                if (!"PENDIENTE".equals(r.at("/object/estado").asText())) return r;
                Thread.sleep(50);
            }
            throw new AssertionError("el capitulo " + capitulo + " no salio de PENDIENTE");
        }

        private Path guardado(int capitulo) {
            return DATOS.resolve("normalizados/" + archivo + "/traducciones/es/" + String.format("cap-%03d.json", capitulo));
        }

        @Test
        @DisplayName("capitulo corto: LISTO en la misma peticion, con los ids de frase intactos y el fichero compartido")
        void corto() throws Exception {
            JsonNode r = capitulo(0);

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(r.at("/object/progreso").asInt()).isEqualTo(100);
            assertThat(r.at("/object/error").isNull()).isTrue();
            JsonNode frases = r.at("/object/frases");
            assertThat(frases).hasSize(4);
            assertThat(frases.get(0).get("id").asText()).isEqualTo("c000-s00000");
            assertThat(frases.get(0).get("texto").asText()).isEqualTo("[es] Chapter One");
            assertThat(frases.get(1).get("texto").asText()).isEqualTo("[es] It rained.");
            assertThat(frases.get(2).get("texto").asText()).as("la vacia sigue vacia").isEmpty();
            assertThat(frases.get(3).get("id").asText()).isEqualTo("c000-s00003");
            assertThat(frases.get(3).get("texto").asText()).isEqualTo("[es] It rained.");
            assertThat(TRADUCTOR.textosTraducidos()).as("la repetida se manda una vez").isEqualTo(2);
            assertThat(TRADUCTOR.peticiones().get(0).get("source").asText())
                    .as("libro sin idioma conocido: auto").isEqualTo("auto");

            JsonNode fichero = json.readTree(guardado(0).toFile());
            assertThat(fichero.get("destino").asText()).isEqualTo("es");
            assertThat(fichero.get("frases")).hasSize(4);
            assertThat(fichero.get("fuenteSha256").asText()).hasSize(64);
        }

        @Test
        @DisplayName("la segunda vez (y para otro usuario con el mismo archivo) sale del fichero sin llamar al traductor")
        void compartido() throws Exception {
            capitulo(0);
            JsonNode deSamy = subirLibro(SAMY, "ingles.epub");
            assertThat(uuid(deSamy.get("archivoId"))).isEqualTo(archivo);

            JsonNode r = capitulo(SAMY, deSamy.get("id").asText(), 0, null);

            assertThat(r.at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(r.at("/object/frases/1/texto").asText()).isEqualTo("[es] It rained.");
            assertThat(TRADUCTOR.peticiones()).hasSize(1);
        }

        @Test
        @DisplayName("propiedad: el ejemplar de otro usuario o uno inexistente dan 102 y no se traduce nada")
        void propiedad() throws Exception {
            JsonNode ajeno = capitulo(SAMY, ejemplar, 0, null);
            assertThat(ajeno.get("errorCode").asInt()).isEqualTo(102);
            assertThat(ajeno.get("message").asText()).isEqualTo("El libro no existe o no está en tu biblioteca.");
            assertThat(capitulo(ANDERSON, UUID.randomUUID(), 0, null).get("errorCode").asInt()).isEqualTo(102);
            assertThat(TRADUCTOR.peticiones()).isEmpty();
            assertThat(Files.exists(guardado(0))).isFalse();
        }

        @Test
        @DisplayName("libro sin convertir, deseo sin archivo, capitulo fuera de rango o sin frases: error claro")
        void errores() throws Exception {
            assertThat(capitulo(6).get("message").asText())
                    .isEqualTo("El libro tiene 6 capítulo(s): elige uno entre 0 y 5.");
            JsonNode sinTexto = capitulo(5);
            assertThat(sinTexto.get("errorCode").asInt()).isEqualTo(102);
            assertThat(sinTexto.get("message").asText()).startsWith("No se encontró el texto de este capítulo.");
            assertThat(capitulo(ANDERSON, ejemplar, -1, null).get("errorCode").asInt()).isEqualTo(120);
            assertThat(capitulo(ANDERSON, ejemplar, 1000, null).get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/traducir/capitulo", Map.of("capitulo", 0)).get("errorCode").asInt())
                    .isEqualTo(120);
            JsonNode destinoRaro = pedir(ANDERSON, "/v1/traducir/capitulo",
                    Map.of("ejemplarId", ejemplar, "capitulo", 0, "destino", "fr"));
            assertThat(destinoRaro.get("message").asText()).startsWith("El idioma \"fr\" no está disponible");

            String deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Uno que quiero")).at("/object/id").asText();
            assertThat(capitulo(ANDERSON, deseo, 0, null).get("message").asText()).isEqualTo("Este libro no tiene archivo.");

            jdbc.update("UPDATE bah_lib_archivo SET estado_conversion = 'PENDIENTE' WHERE id = ?", archivo);
            JsonNode convirtiendo = capitulo(0);
            assertThat(convirtiendo.get("errorCode").asInt()).isEqualTo(120);
            assertThat(convirtiendo.get("message").asText())
                    .isEqualTo("El libro todavía se está preparando; podrás traducirlo cuando termine.");
            assertThat(TRADUCTOR.peticiones()).isEmpty();
        }

        @Test
        @DisplayName("el idioma del libro decide el origen: en -> en, sin detectar nada")
        void idiomaDelLibro() throws Exception {
            idiomaDelLibro("en-US");
            capitulo(0);
            assertThat(TRADUCTOR.peticiones().get(0).get("source").asText()).isEqualTo("en");
            assertThat(TRADUCTOR.detecciones()).isEmpty();
        }

        private void idiomaDelLibro(String idioma) {
            jdbc.update("UPDATE bah_lib_obra SET idioma = ? WHERE id = "
                    + "(SELECT obra_id FROM bah_lib_ejemplar WHERE id = ?)", idioma, UUID.fromString(ejemplar));
        }

        @Test
        @DisplayName("QA NU-02: libro sin idioma -> se detecta el capitulo y se traduce con auto")
        void nu02SinIdioma() throws Exception {
            idiomaDelLibro(null);
            JsonNode r = capitulo(0);

            assertThat(r.at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(TRADUCTOR.peticiones().get(0).get("source").asText()).isEqualTo("auto");
            assertThat(TRADUCTOR.detecciones()).hasSize(1);
            assertThat(TRADUCTOR.detecciones().get(0).get("q").asText()).isEqualTo("Chapter One\nIt rained.\nIt rained.\n");
        }

        @Test
        @DisplayName("QA NU-02: libro marcado 'es' (inventado) pero el texto es ingles -> se traduce, no da 120")
        void nu02EsInventado() throws Exception {
            idiomaDelLibro("es");
            JsonNode r = capitulo(0);

            assertThat(r.get("correct").asBoolean()).isTrue();
            assertThat(r.at("/object/frases/1/texto").asText()).isEqualTo("[es] It rained.");
            assertThat(TRADUCTOR.peticiones().get(0).get("source").asText()).isEqualTo("auto");
        }

        @Test
        @DisplayName("QA NU-02: 120 mismoIdioma solo si el texto del capitulo se detecta en el destino, sin gastar cupo")
        void nu02DeVerdadEnEspanol() throws Exception {
            idiomaDelLibro("es");
            TRADUCTOR.detectara("es", 95.0);
            JsonNode r = capitulo(0);

            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("El texto ya está en el idioma de destino (\"es\").");
            assertThat(TRADUCTOR.peticiones()).isEmpty();

            idiomaDelLibro(null);
            assertThat(capitulo(0).get("errorCode").asInt()).as("sin idioma y texto en espanol: igual").isEqualTo(120);

            TRADUCTOR.detectara("es", 20.0);
            assertThat(capitulo(0).at("/object/estado").asText()).as("deteccion dudosa: se traduce")
                    .isEqualTo("LISTO");
        }

        @Test
        @DisplayName("capitulo largo: PENDIENTE mientras se traduce (sin lanzarlo dos veces), luego LISTO por lotes")
        void asincrono() throws Exception {
            TRADUCTOR.retener();
            JsonNode primera = capitulo(1);
            assertThat(primera.at("/object/estado").asText()).isEqualTo("PENDIENTE");
            assertThat(primera.at("/object/frases")).isEmpty();
            JsonNode segunda = capitulo(1);
            assertThat(segunda.at("/object/estado").asText()).isEqualTo("PENDIENTE");
            assertThat(segunda.at("/object/progreso").asInt()).isZero();

            TRADUCTOR.soltar();
            JsonNode listo = esperar(1);

            assertThat(listo.at("/object/estado").asText()).isEqualTo("LISTO");
            JsonNode frases = listo.at("/object/frases");
            assertThat(frases).hasSize(8);
            assertThat(frases.get(6).get("id").asText()).isEqualTo("c001-s00006");
            assertThat(frases.get(6).get("texto").asText()).isEqualTo(frases.get(0).get("texto").asText());
            assertThat(frases.get(7).get("texto").asText()).isEqualTo("  ");
            assertThat(TRADUCTOR.textosTraducidos()).as("6 distintas, una sola vez").isEqualTo(6);
            assertThat(TRADUCTOR.peticiones()).as("lotes de 3 frases").hasSize(2);
            assertThat(TRADUCTOR.peticiones()).allMatch(p -> p.get("q").size() <= 3);
        }

        @Test
        @DisplayName("si el taller cambia las frases (reconversion), la traduccion vieja no vale y se rehace")
        void cambioDeTexto() throws Exception {
            capitulo(0);
            frases(0, List.of("Chapter One", "It snowed."));

            JsonNode r = capitulo(0);

            assertThat(r.at("/object/frases")).hasSize(2);
            assertThat(r.at("/object/frases/1/texto").asText()).isEqualTo("[es] It snowed.");
            assertThat(TRADUCTOR.peticiones()).hasSize(2);
        }

        @Test
        @DisplayName("una traduccion guardada ilegible se rehace")
        void guardadoRoto() throws Exception {
            capitulo(0);
            Files.writeString(guardado(0), "{no es json");

            assertThat(capitulo(0).at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(TRADUCTOR.peticiones()).hasSize(2);
        }

        @Test
        @DisplayName("traductor caido: corto da 503; largo queda en ERROR con motivo, no se relanza solo y si con reintentar")
        void caido() throws Exception {
            TRADUCTOR.modo(TraductorFalso.Modo.ERROR_500);
            JsonNode corto = capitulo(0);
            assertThat(corto.get("errorCode").asInt()).isEqualTo(503);
            assertThat(corto.get("message").asText()).isEqualTo(NO_DISPONIBLE);

            JsonNode error = esperar(1);
            assertThat(error.get("correct").asBoolean()).isTrue();
            assertThat(error.at("/object/estado").asText()).isEqualTo("ERROR");
            assertThat(error.at("/object/error").asText()).isEqualTo("No se pudo traducir el capítulo: " + NO_DISPONIBLE);
            int llamadas = TRADUCTOR.peticiones().size();
            assertThat(capitulo(1).at("/object/estado").asText()).isEqualTo("ERROR");
            assertThat(TRADUCTOR.peticiones()).as("un ERROR no se relanza en cada consulta").hasSize(llamadas);

            TRADUCTOR.modo(TraductorFalso.Modo.BIEN);
            JsonNode otraVez = capitulo(ANDERSON, ejemplar, 1, true);
            assertThat(otraVez.at("/object/estado").asText()).isEqualTo("PENDIENTE");
            assertThat(esperar(1).at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(Files.exists(guardado(1))).isTrue();
        }

        @Test
        @DisplayName("cola llena (1 en curso + 2 esperando): el cuarto capitulo da 429 traductor ocupado")
        void colaLlena() throws Exception {
            for (int c = 2; c <= 4; c++) frases(c, largo("Cap" + c, 6));
            TRADUCTOR.retener();
            try {
                assertThat(capitulo(1).at("/object/estado").asText()).isEqualTo("PENDIENTE");
                assertThat(capitulo(2).at("/object/estado").asText()).isEqualTo("PENDIENTE");
                assertThat(capitulo(3).at("/object/estado").asText()).isEqualTo("PENDIENTE");

                JsonNode cuarto = capitulo(4);
                assertThat(cuarto.get("errorCode").asInt()).isEqualTo(429);
                assertThat(cuarto.get("message").asText())
                        .isEqualTo("El traductor está ocupado con otros capítulos. Vuelve a intentarlo en un minuto.");
            } finally {
                TRADUCTOR.soltar();
            }
            for (int c = 1; c <= 3; c++) assertThat(esperar(c).at("/object/estado").asText()).isEqualTo("LISTO");
            assertThat(esperar(4).at("/object/estado").asText()).as("rechazado no queda colgado").isEqualTo("LISTO");
        }

        @Test
        @DisplayName("si /datos no esta montado: 503 de almacenamiento, sin llamar al traductor")
        void sinDatos() throws Exception {
            borrar(DATOS);
            try {
                JsonNode r = capitulo(0);
                assertThat(r.get("errorCode").asInt()).isEqualTo(503);
                assertThat(r.get("message").asText()).startsWith("Los archivos de la biblioteca no están disponibles");
            } finally {
                Files.createDirectories(DATOS);
            }
            assertThat(TRADUCTOR.peticiones()).isEmpty();
        }

        @Test
        @DisplayName("la respuesta tiene exactamente el contrato {estado, frases[{id, texto}], error, progreso}")
        void contrato() throws Exception {
            mvc.perform(post("/biblioteca/v1/traducir/capitulo").contextPath("/biblioteca")
                            .header("Authorization", bearer(ANDERSON))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"ejemplarId\":\"" + ejemplar + "\",\"capitulo\":0}"))
                    .andExpect(jsonPath("$.object.estado").value("LISTO"))
                    .andExpect(jsonPath("$.object.frases[0].id").value("c000-s00000"))
                    .andExpect(jsonPath("$.object.frases[0].texto").value("[es] Chapter One"))
                    .andExpect(jsonPath("$.object.progreso").value(100));
            List<String> campos = new ArrayList<>();
            capitulo(0).get("object").fieldNames().forEachRemaining(campos::add);
            assertThat(campos).containsExactlyInAnyOrder("estado", "frases", "error", "progreso");
            List<String> deFrase = new ArrayList<>();
            capitulo(0).at("/object/frases/0").fieldNames().forEachRemaining(deFrase::add);
            assertThat(deFrase).containsExactlyInAnyOrder("id", "texto");
            List<String> deTexto = new ArrayList<>();
            traducir(ANDERSON, Map.of("texto", "Hi.")).get("object").fieldNames().forEachRemaining(deTexto::add);
            assertThat(deTexto).containsExactlyInAnyOrder("traduccion", "origenDetectado");
        }
    }
}
