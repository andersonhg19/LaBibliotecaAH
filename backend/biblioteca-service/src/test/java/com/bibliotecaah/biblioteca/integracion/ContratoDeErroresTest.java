package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Contrato de errores: todo vuelve como ResultDTO con mensaje en espanol")
class ContratoDeErroresTest extends PostgresDeVerdad {

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
        @DisplayName("un error no previsto responde 103 sin detalles internos")
        void noPrevisto() throws Exception {
            JsonNode r = json.readTree(mvc.perform(post("/biblioteca/v1/libros/subir").contextPath("/biblioteca")
                    .header("Authorization", bearer(ANDERSON)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(r.get("errorCode").asInt()).isEqualTo(103);
            assertThat(r.get("message").asText()).isEqualTo("Ocurrió un error inesperado procesando la petición. Inténtalo de nuevo.");
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
        @DisplayName("un token sin claim userId entra pero no identifica a nadie: 401 de negocio")
        void sinUserId() throws Exception {
            String sinId = JWT.create().withSubject("x").withArrayClaim("roles", new String[]{"USER"})
                    .sign(Algorithm.HMAC256(SECRETO));
            mvc.perform(post("/biblioteca/v1/libros/all").contextPath("/biblioteca").header("Authorization", "Bearer " + sinId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.errorCode").value(401));
        }
    }
}
