package com.bibliotecaah.biblioteca.spec;

import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * LA SPEC PUBLICADA ESTA AL DIA
 * ============================================================================
 *
 * QUE DEFIENDE
 * ------------
 * La API de este proyecto estaba descrita en tres sitios —el README, una
 * coleccion de Postman y la cabeza de quien la escribio— y los tres se
 * quedaron atras. Documentacion escrita a mano es documentacion que un dia
 * miente, y la unica forma de que deje de mentir es que la construccion se
 * ponga roja cuando lo hace.
 *
 * Esta prueba levanta el servicio de verdad, le pide su especificacion OpenAPI
 * a springdoc y la compara, byte a byte, con el JSON commiteado en
 * documentación/api. Anadir, quitar o cambiar la firma de un endpoint sin
 * regenerar la spec rompe aqui.
 *
 * COMO SE REGENERA
 * ----------------
 *   mvn -B test -Dtest=LaSpecPublicadaEstaAlDiaTest -Dactualizar.spec=true
 *
 * y se commitea lo que cambie. Nunca a mano: el fichero se escribe desde el
 * codigo justamente para que nadie pueda "arreglarlo" editandolo.
 *
 * POR QUE SE NORMALIZA ANTES DE COMPARAR
 * --------------------------------------
 * springdoc construye el documento recorriendo los controllers, y ese recorrido
 * no garantiza el mismo orden en dos ejecuciones distintas. Sin ordenar las
 * claves, el fichero cambiaria solo, cada dos por tres, sin que nadie hubiera
 * tocado un endpoint: un guardarrail que grita cuando no pasa nada se acaba
 * ignorando. Se quita ademas el bloque "servers", que en la prueba lleva el
 * puerto aleatorio con el que arranco el servicio.
 */
@DisplayName("La especificacion OpenAPI commiteada coincide con la que genera el codigo")
class LaSpecPublicadaEstaAlDiaTest extends com.bibliotecaah.biblioteca.PostgresDeVerdad {

    private static final String PUBLICADA = "documentación/api/biblioteca-service.json";


    @Test
    @DisplayName("biblioteca-service.json es exactamente lo que springdoc genera hoy")
    void laSpecCommiteadaCoincideConLaGenerada() throws Exception {
        String generada = pedirLaSpec();
        Path fichero = raizDelRepositorio().resolve(PUBLICADA);

        if (Boolean.getBoolean("actualizar.spec")) {
            Files.createDirectories(fichero.getParent());
            Files.writeString(fichero, generada, StandardCharsets.UTF_8);
            return;
        }

        assertThat(fichero)
                .as("no existe " + PUBLICADA + ". Generala con -Dactualizar.spec=true")
                .exists();
        assertThat(Files.readString(fichero, StandardCharsets.UTF_8))
                .as("""
                        La spec commiteada ya no describe la API.

                          QUE HACER: regenerala y commitea el cambio.
                          mvn -B test -pl biblioteca-service -Dtest=LaSpecPublicadaEstaAlDiaTest \\
                              -Dactualizar.spec=true

                          Si el diff trae endpoints que no esperabas, el problema no es la
                          spec: es que se cambio la API sin querer.""")
                .isEqualTo(generada);
    }

    @Test
    @DisplayName("la especificacion se sirve SIN token: es la documentacion de como pedirlo")
    void laSpecSeSirveSinToken() {
        /* Si algun dia el filtro de seguridad se come /v3/api-docs, Swagger UI
           deja de cargar y quien abra la documentacion ve un 401 en blanco. */
        assertThat(obtener().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("la spec declara el esquema bearerAuth: sin el, el boton Authorize no sirve")
    void laSpecDeclaraElEsquemaJwt() {
        JsonNode spec = leer(pedirLaSpec());

        assertThat(spec.at("/components/securitySchemes/bearerAuth/scheme").asText())
                .isEqualTo("bearer");
        assertThat(spec.at("/components/securitySchemes/bearerAuth/bearerFormat").asText())
                .isEqualTo("JWT");
    }

    // ========================================================================
    // Herramientas

    private String pedirLaSpec() {
        var respuesta = obtener();
        assertThat(respuesta.getStatus())
                .as("springdoc no contesto: sin spec no hay nada que comparar")
                .isEqualTo(200);
        try {
            return aTextoEstable(leer(respuesta.getContentAsString(StandardCharsets.UTF_8)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private org.springframework.mock.web.MockHttpServletResponse obtener() {
        try {
            return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                    .get("/biblioteca/v3/api-docs").contextPath("/biblioteca")).andReturn().getResponse();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static final ObjectMapper JSON_SPEC = new ObjectMapper();

    private static JsonNode leer(String json) {
        try {
            return JSON_SPEC.readTree(json);
        } catch (IOException e) {
            throw new UncheckedIOException("springdoc devolvio algo que no es JSON", e);
        }
    }

    /** Mismo contenido, siempre el mismo texto: claves ordenadas, LF y salto final. */
    private static String aTextoEstable(JsonNode documento) {
        ObjectNode raiz = (ObjectNode) documento;
        raiz.remove("servers"); // lleva el puerto aleatorio de la prueba

        DefaultPrettyPrinter formato = new DefaultPrettyPrinter()
                .withObjectIndenter(new DefaultIndenter("  ", "\n"))
                .withArrayIndenter(new DefaultIndenter("  ", "\n"));
        try {
            return JSON_SPEC.writer(formato).writeValueAsString(ordenar(raiz, null)) + "\n";
        } catch (IOException e) {
            throw new UncheckedIOException("no puedo serializar la spec", e);
        }
    }

    /**
     * Ordena las claves de todos los objetos. Las listas se dejan como vienen
     * —su orden si significa algo en OpenAPI: el de los parametros, el de los
     * valores de un enum— salvo la de "tags", que sale del recorrido de los
     * controllers y por tanto no tiene orden fijo entre dos ejecuciones.
     */
    private static JsonNode ordenar(JsonNode nodo, String claveDelPadre) {
        if (nodo.isObject()) {
            List<String> claves = new ArrayList<>();
            nodo.fieldNames().forEachRemaining(claves::add);
            claves.sort(Comparator.naturalOrder());

            ObjectNode ordenado = JSON_SPEC.createObjectNode();
            for (String clave : claves) {
                ordenado.set(clave, ordenar(nodo.get(clave), clave));
            }
            return ordenado;
        }
        if (nodo.isArray()) {
            List<JsonNode> hijos = new ArrayList<>();
            nodo.forEach(hijo -> hijos.add(ordenar(hijo, null)));
            if ("tags".equals(claveDelPadre)
                    && hijos.stream().allMatch(h -> h.isObject() && h.has("name"))) {
                hijos.sort(Comparator.comparing(h -> h.get("name").asText()));
            }
            ArrayNode lista = JSON_SPEC.createArrayNode();
            hijos.forEach(lista::add);
            return lista;
        }
        return nodo;
    }

    /** La carpeta que contiene backend/ y documentación/. */
    private static Path raizDelRepositorio() {
        Path actual = Paths.get("").toAbsolutePath();
        for (Path candidato = actual; candidato != null; candidato = candidato.getParent()) {
            if (Files.isDirectory(candidato.resolve("backend/biblioteca-service/src"))) {
                return candidato;
            }
        }
        throw new IllegalStateException("No encuentro la raiz del repositorio desde " + actual);
    }
}
