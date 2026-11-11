package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.bibliotecaah.biblioteca.config.TomcatConfig;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lo que solo se ve con el Tomcat de verdad (MockMvc no pasa por el conector):
 *
 *  · QA RG-02: una subida que pasa del tope POR ARCHIVO (pero no del tope por peticion) se responde con el
 *    413 ResultDTO y Tomcat descarta el resto del cuerpo en streaming, sin cortar la conexion: el gateway no
 *    se queda con el cuerpo a medias en memoria. Por encima del tope por peticion tambien llega el 413.
 *  · QA SE-16 a: una ruta con {@code %2f} da 400 con ResultDTO en JSON, no la pagina HTML de Tomcat.
 *
 * Topes de esta prueba: 1 MB por archivo y 24 MB por peticion (y de descarte).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.servlet.multipart.max-file-size=1MB",
        "spring.servlet.multipart.max-request-size=24MB"})
@DisplayName("Tomcat de verdad: subidas por encima del tope y rutas que Tomcat rechaza")
class TomcatDeVerdadTest extends PostgresDeVerdad {

    private static final String LIMITE = "----limite-bah";

    @LocalServerPort private int puerto;

    /** Respuesta HTTP/1.1 leida a mano del socket (cabeceras en minusculas). */
    private record Respuesta(int estado, Map<String, String> cabeceras, String cuerpo) { }

    @Nested
    @DisplayName("QA RG-02: subidas por encima del tope")
    class Subidas {

        @Test
        @DisplayName("archivo de 12 MB (tope 1 MB por archivo, 24 MB por peticion): 413 ResultDTO, todo el cuerpo "
                + "se envia sin que la conexion se corte, y la misma conexion sigue sirviendo")
        void archivoPorEncimaDelTope() throws Exception {
            try (Socket s = new Socket("127.0.0.1", puerto)) {
                s.setSoTimeout(60_000);
                OutputStream salida = s.getOutputStream();
                InputStream entrada = s.getInputStream();

                // Si Tomcat cerrara al pasar el tope, escribir los 11 MB restantes fallaria (connection reset).
                enviarSubida(salida, 12 * 1024 * 1024);
                Respuesta r = leer(entrada);

                assertThat(r.estado()).isEqualTo(200);
                assertThat(r.cabeceras().getOrDefault("connection", "")).isNotEqualToIgnoringCase("close");
                JsonNode cuerpo = json.readTree(r.cuerpo());
                assertThat(cuerpo.get("correct").asBoolean()).isFalse();
                assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(413);
                assertThat(cuerpo.get("message").asText())
                        .isEqualTo("El archivo o la subida supera el tamaño máximo: 1 MB por archivo y 24 MB por subida.");

                // Keep-alive: la misma conexion atiende otra peticion.
                byte[] vacio = "{}".getBytes(StandardCharsets.UTF_8);
                salida.write(("POST /biblioteca/v1/estantes/all HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                        + "Authorization: " + bearer(ANDERSON) + "\r\nContent-Type: application/json\r\n"
                        + "Content-Length: " + vacio.length + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                salida.write(vacio);
                salida.flush();
                Respuesta otra = leer(entrada);
                assertThat(otra.estado()).isEqualTo(200);
                assertThat(json.readTree(otra.cuerpo()).get("correct").asBoolean()).isTrue();
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isZero();
        }

        @Test
        @DisplayName("peticion de 40 MB (tope 24 MB por peticion): 413 ResultDTO antes de leer el cuerpo")
        void peticionPorEncimaDelTope() throws Exception {
            try (Socket s = new Socket("127.0.0.1", puerto)) {
                s.setSoTimeout(60_000);
                OutputStream salida = s.getOutputStream();
                // El cuerpo se manda en otro hilo: Tomcat responde sin esperar y luego descarta hasta su tope.
                CompletableFuture<Void> envio = CompletableFuture.runAsync(() -> {
                    try {
                        enviarSubida(salida, 40 * 1024 * 1024);
                    } catch (IOException cortado) {
                        // Pasado el tope de descarte Tomcat cierra: es lo esperado por encima del tope por peticion.
                    }
                });
                Respuesta r = leer(s.getInputStream());

                assertThat(r.estado()).isEqualTo(200);
                JsonNode cuerpo = json.readTree(r.cuerpo());
                assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(413);
                envio.get(60, TimeUnit.SECONDS);
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isZero();
        }
    }

    @Nested
    @DisplayName("QA SE-16 a: rutas que Tomcat rechaza")
    class Rutas {

        @ParameterizedTest(name = "POST {0}")
        @ValueSource(strings = {"/biblioteca/v1/estantes%2fall", "/biblioteca/v1/libros/get/..%2f..",
                "/biblioteca/v1/libros%2Fall"})
        @DisplayName("una barra codificada da 400 con ResultDTO {errorCode:120} en JSON, sin HTML ni servidor")
        void barraCodificada(String ruta) throws Exception {
            HttpResponse<String> r = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + puerto + ruta))
                            .header("Authorization", bearer(ANDERSON)).header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString("{}")).build(),
                    HttpResponse.BodyHandlers.ofString());

            assertThat(r.statusCode()).isEqualTo(400);
            assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
            assertThat(r.body()).doesNotContain("<html", "Tomcat", "Exception");
            JsonNode cuerpo = json.readTree(r.body());
            assertThat(cuerpo.get("correct").asBoolean()).isFalse();
            assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(120);
            assertThat(cuerpo.get("message").asText()).isEqualTo("La dirección pedida no es válida.");
        }

        @Test
        @DisplayName("la valvula traduce cada estado; la que Tomcat crearia por nombre tambien es JSON")
        void cuerpos() throws Exception {
            TomcatConfig.ErrorJsonValve porNombre = new TomcatConfig.ErrorJsonValve();
            assertThat(json.readTree(porNombre.cuerpo(400)).get("errorCode").asInt()).isEqualTo(120);
            assertThat(json.readTree(porNombre.cuerpo(404)).get("errorCode").asInt()).isEqualTo(102);
            assertThat(json.readTree(porNombre.cuerpo(500)).get("errorCode").asInt()).isEqualTo(103);
        }
    }

    // ------------------------------------------------------------------ HTTP a mano

    /** Multipart con un archivo de {@code bytes} bytes, generado en streaming (nunca entero en memoria). */
    private static void enviarSubida(OutputStream salida, long bytes) throws IOException {
        byte[] cabecera = ("--" + LIMITE + "\r\nContent-Disposition: form-data; name=\"archivos\"; "
                + "filename=\"grande.txt\"\r\nContent-Type: text/plain\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] cierre = ("\r\n--" + LIMITE + "--\r\n").getBytes(StandardCharsets.US_ASCII);
        long largo = cabecera.length + bytes + cierre.length;
        salida.write(("POST /biblioteca/v1/libros/subir HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                + "Authorization: " + bearer(ANDERSON) + "\r\n"
                + "Content-Type: multipart/form-data; boundary=" + LIMITE + "\r\n"
                + "Content-Length: " + largo + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        salida.write(cabecera);
        byte[] bloque = new byte[64 * 1024];
        Arrays.fill(bloque, (byte) 'a');
        for (long enviados = 0; enviados < bytes; ) {
            int n = (int) Math.min(bloque.length, bytes - enviados);
            salida.write(bloque, 0, n);
            enviados += n;
        }
        salida.write(cierre);
        salida.flush();
    }

    private static Respuesta leer(InputStream entrada) throws IOException {
        String estado = linea(entrada);
        Map<String, String> cabeceras = new LinkedHashMap<>();
        for (String l = linea(entrada); !l.isEmpty(); l = linea(entrada)) {
            int dos = l.indexOf(':');
            cabeceras.put(l.substring(0, dos).trim().toLowerCase(Locale.ROOT), l.substring(dos + 1).trim());
        }
        ByteArrayOutputStream cuerpo = new ByteArrayOutputStream();
        if ("chunked".equalsIgnoreCase(cabeceras.get("transfer-encoding"))) {
            for (int n = Integer.parseInt(linea(entrada).trim(), 16); n > 0; n = Integer.parseInt(linea(entrada).trim(), 16)) {
                cuerpo.write(entrada.readNBytes(n));
                linea(entrada);
            }
            linea(entrada);
        } else if (cabeceras.containsKey("content-length")) {
            cuerpo.write(entrada.readNBytes(Integer.parseInt(cabeceras.get("content-length"))));
        }
        return new Respuesta(Integer.parseInt(estado.split(" ")[1]), cabeceras,
                cuerpo.toString(StandardCharsets.UTF_8));
    }

    private static String linea(InputStream entrada) throws IOException {
        StringBuilder s = new StringBuilder();
        for (int c = entrada.read(); c != -1; c = entrada.read()) {
            if (c == '\n') break;
            if (c != '\r') s.append((char) c);
        }
        return s.toString();
    }
}
