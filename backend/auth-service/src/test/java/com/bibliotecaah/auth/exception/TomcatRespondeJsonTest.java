package com.bibliotecaah.auth.exception;

import com.bibliotecaah.auth.config.TomcatConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QA SE-16 a: lo que Tomcat rechaza antes de llegar a Spring (una barra codificada {@code %2f} en la ruta)
 * respondia su pagina HTML ("HTTP Status 400 – Bad Request"). Ahora es un ResultDTO en JSON, sin HTML ni
 * version del servidor. Con Tomcat de verdad: MockMvc no pasa por el conector.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DisplayName("QA SE-16 a: los rechazos de Tomcat son JSON, no HTML")
class TomcatRespondeJsonTest {

    @LocalServerPort private int puerto;
    @Autowired private ObjectMapper json;

    private final HttpClient cliente = HttpClient.newHttpClient();

    @ParameterizedTest(name = "POST {0}")
    @ValueSource(strings = {"/biblioteca/v1/users%2fall", "/biblioteca/v1/admin%2fusers/all", "/biblioteca/v1/auth%2Flogin"})
    @DisplayName("una ruta con %2f da 400 con ResultDTO {correct:false, errorCode:400} y mensaje en espanol")
    void barraCodificada(String ruta) throws Exception {
        HttpResponse<String> r = cliente.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + puerto + ruta))
                .POST(HttpRequest.BodyPublishers.ofString("{}")).header("Content-Type", "application/json").build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(r.headers().firstValue("Content-Type")).hasValueSatisfying(t -> assertThat(t).startsWith("application/json"));
        assertThat(r.body()).doesNotContain("<html", "Tomcat", "Exception");
        JsonNode cuerpo = json.readTree(r.body());
        assertThat(cuerpo.get("correct").asBoolean()).isFalse();
        assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(400);
        assertThat(cuerpo.get("message").asText()).isEqualTo("La dirección pedida no es válida.");
    }

    @Test
    @DisplayName("la valvula traduce cada estado a su cuerpo; la instancia por nombre (sin Spring) tambien es JSON")
    void cuerpos() throws Exception {
        TomcatConfig.ErrorJsonValve porNombre = new TomcatConfig.ErrorJsonValve();
        assertThat(json.readTree(porNombre.cuerpo(400)).get("errorCode").asInt()).isEqualTo(400);
        assertThat(json.readTree(porNombre.cuerpo(404)).get("errorCode").asInt()).isEqualTo(404);
        assertThat(json.readTree(porNombre.cuerpo(503)).get("errorCode").asInt()).isEqualTo(500);
    }
}
