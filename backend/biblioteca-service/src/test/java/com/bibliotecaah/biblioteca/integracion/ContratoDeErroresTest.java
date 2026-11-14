package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;

import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Contrato de errores: todo vuelve como ResultDTO con mensaje en espanol")
class ContratoDeErroresTest extends PostgresDeVerdad {

    @org.springframework.beans.factory.annotation.Autowired
    private com.bibliotecaah.biblioteca.exception.GlobalExceptionHandler manejador;

    @Nested
    @DisplayName("Peticiones mal formadas (HTTP 200, correct=false)")
    class MalFormadas {

        @Test
        @DisplayName("JSON roto, tipo equivocado e id que no es UUID responden 120")
        void cuerpos() throws Exception {
            JsonNode roto = pedir(ANDERSON, "/v1/libros/deseo", "{");
            assertThat(roto.get("errorCode").asInt()).isEqualTo(120);
            assertThat(roto.get("message").asText()).isEqualTo("El cuerpo de la petición viene vacío o no es un JSON válido.");

            JsonNode tipo = pedir(ANDERSON, "/v1/libros/deseo", "{\"titulo\":[1,2]}");
            assertThat(tipo.get("message").asText()).isEqualTo("El campo \"titulo\" llegó con un tipo que no corresponde.");

            JsonNode id = pedir(ANDERSON, "/v1/libros/get/no-soy-uuid");
            assertThat(id.get("errorCode").asInt()).isEqualTo(120);
            assertThat(id.get("message").asText()).isEqualTo("El parámetro \"ejemplarId\" no admite el valor enviado (no-soy-uuid).");

            JsonNode largo = pedir(ANDERSON, "/v1/estantes/save", "{\"nombre\":\"" + "x".repeat(150) + "\"}");
            assertThat(largo.get("message").asText()).isEqualTo("Revisa los datos enviados: nombre no puede superar los 100 caracteres.");
        }

        @Test
        @DisplayName("un error no previsto responde 103 sin detalles internos; un tipo de contenido equivocado, 120 (SE-16)")
        void noPrevisto() throws Exception {
            JsonNode r = json.readTree(mvc.perform(post("/biblioteca/v1/libros/subir").contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
            assertThat(r.get("message").asText()).isEqualTo("La petición debe enviarse como JSON (Content-Type: application/json).");

            var inesperado = manejador.errorNoPrevisto(new IllegalStateException("detalle interno")).getBody();
            assertThat(inesperado.getErrorCode()).isEqualTo(103);
            assertThat(inesperado.getMessage()).isEqualTo("Ocurrió un error inesperado procesando la petición. Inténtalo de nuevo.");
            var conflicto = manejador.conflicto(new org.springframework.dao.DataIntegrityViolationException("x")).getBody();
            assertThat(conflicto.getErrorCode()).isEqualTo(101);
            assertThat(conflicto.getMessage()).isEqualTo("Otra petición igual llegó al mismo tiempo. Recarga y comprueba el resultado.");
        }

        @Test
        @ExtendWith(OutputCaptureExtension.class)
        @DisplayName("una ruta que no existe: 404 con ResultDTO 102 y sin ERROR en el log; un metodo que la ruta no "
                + "admite: 405 con ResultDTO 120")
        void rutaInexistente(CapturedOutput salida) throws Exception {
            var r = mvc.perform(get("/biblioteca/v1/no-existe/de-verdad").contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON))).andReturn().getResponse();
            assertThat(r.getStatus()).isEqualTo(404);
            assertThat(r.getContentType()).startsWith("application/json");
            JsonNode cuerpo = json.readTree(r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(cuerpo.get("correct").asBoolean()).isFalse();
            assertThat(cuerpo.get("errorCode").asInt()).isEqualTo(102);
            assertThat(cuerpo.get("message").asText()).isEqualTo("La dirección pedida no existe.");

            var metodo = mvc.perform(get("/biblioteca/v1/estantes/all").contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON))).andReturn().getResponse();
            assertThat(metodo.getStatus()).isEqualTo(405);
            JsonNode m = json.readTree(metodo.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(m.get("errorCode").asInt()).isEqualTo(120);
            assertThat(m.get("message").asText()).isEqualTo("La dirección pedida no admite ese método.");

            assertThat(salida.getAll()).doesNotContain("Error no previsto");
        }

        @Test
        @DisplayName("una subida multipart rota responde 120")
        void multipartRoto() throws Exception {
            JsonNode r = json.readTree(mvc.perform(post("/biblioteca/v1/libros/subir").contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON))
                    .contentType("multipart/form-data; boundary=xyz").content("--xyz\r\nbasura"))
                    .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
        }
    }

    @Nested
    @DisplayName("Seguridad")
    class Seguridad {

        @Test
        @DisplayName("sin token 401; token caducado o firmado con otra clave 401 JSON; X-Request-Id siempre vuelve")
        void tokens() throws Exception {
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().exists("X-Request-Id"));
            String caducado = JWT.create().withClaim("userId", 1L).withExpiresAt(new Date(System.currentTimeMillis() - 1000))
                    .sign(Algorithm.HMAC256(SECRETO));
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca").header("Authorization", "Bearer " + caducado))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Sesion invalida o vencida"));
            String ajeno = JWT.create().withClaim("userId", 1L).sign(Algorithm.HMAC256("otra-clave"));
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca").header("Authorization", "Bearer " + ajeno)
                            .header("X-Request-Id", "prueba-123"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string("X-Request-Id", "prueba-123"));
        }

        @Test
        @DisplayName("un token sin claim userId ni exp no entra: 401 (SE-18)")
        void sinUserId() throws Exception {
            String sinId = JWT.create().withSubject("x").withArrayClaim("roles", new String[]{"USER"})
                    .sign(Algorithm.HMAC256(SECRETO));
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca").header("Authorization", "Bearer " + sinId))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.errorCode").value(401));
        }
    }
}
