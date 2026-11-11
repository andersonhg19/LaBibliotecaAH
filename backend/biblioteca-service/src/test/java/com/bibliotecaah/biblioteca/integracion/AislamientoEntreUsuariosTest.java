package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Samy no ve, no toca y no descarga nada de Anderson: cada intento responde
 * "no encontrado" (102 / 404), sin confirmar siquiera que existe.
 */
@DisplayName("Aislamiento: un usuario nunca ve lo de otro")
class AislamientoEntreUsuariosTest extends PostgresDeVerdad {

    private String ejemplar;
    private String archivo;
    private String anotacion;
    private String comentario;
    private String estante;

    @BeforeEach
    void bibliotecaDeAnderson() throws Exception {
        JsonNode e = subirLibro(ANDERSON, "secreto.epub");
        ejemplar = e.get("id").asText();
        archivo = e.get("archivoId").asText();
        anotacion = pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", ejemplar, "tipo", "NOTA", "nota", "mia"))
                .get("object").get("id").asText();
        comentario = pedir(ANDERSON, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", "mio"))
                .get("object").get("id").asText();
        estante = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Privado")).get("object").get("id").asText();
        escribir(DATOS.resolve("normalizados/" + archivo + "/libro.epub"), epub("n"));
    }

    private void noEncontrado(JsonNode r) {
        assertThat(r.get("correct").asBoolean()).isFalse();
        assertThat(r.get("errorCode").asInt()).isEqualTo(102);
    }

    @Test
    @DisplayName("libros: ni ficha, ni edicion, ni borrado, ni aparece en sus listas")
    void libros() throws Exception {
        noEncontrado(pedir(SAMY, "/v1/libros/get/" + ejemplar));
        noEncontrado(pedir(SAMY, "/v1/libros/save", Map.of("id", ejemplar, "titulo", "robado")));
        noEncontrado(pedir(SAMY, "/v1/libros/delete/" + ejemplar));
        assertThat(pedir(SAMY, "/v1/libros/all").get("object").get("totalElements").asLong()).isZero();
        assertThat(pedir(SAMY, "/v1/libros/facetas").get("object").get("formatos")).isEmpty();
        assertThat(pedir(ANDERSON, "/v1/libros/get/" + ejemplar).get("object").get("titulo").asText()).isEqualTo("secreto");
    }

    @Test
    @DisplayName("progreso, anotaciones y comentarios")
    void notasYProgreso() throws Exception {
        noEncontrado(pedir(SAMY, "/v1/progreso/get/" + ejemplar));
        noEncontrado(pedir(SAMY, "/v1/progreso/save", Map.of("ejemplarId", ejemplar, "capitulo", 9)));
        noEncontrado(pedir(SAMY, "/v1/anotaciones/all/" + ejemplar));
        noEncontrado(pedir(SAMY, "/v1/anotaciones/delete/" + anotacion));
        noEncontrado(pedir(SAMY, "/v1/anotaciones/save", Map.of("id", anotacion, "ejemplarId", ejemplar, "tipo", "NOTA")));
        noEncontrado(pedir(SAMY, "/v1/comentarios/all/" + ejemplar));
        noEncontrado(pedir(SAMY, "/v1/comentarios/delete/" + comentario));
        noEncontrado(pedir(SAMY, "/v1/comentarios/save", Map.of("ejemplarId", ejemplar, "texto", "intruso")));
        noEncontrado(pedir(SAMY, "/v1/audio/estado", Map.of("ejemplarId", ejemplar, "vozId", "edge.x", "capitulo", 0)));
        assertThat(pedir(ANDERSON, "/v1/anotaciones/all/" + ejemplar).get("object")).hasSize(1);
    }

    @Test
    @DisplayName("estantes: ni ver sus libros, ni meterle libros, ni borrarlo; ni meter un libro ajeno en el mio")
    void estantes() throws Exception {
        noEncontrado(pedir(SAMY, "/v1/estantes/" + estante + "/libros"));
        noEncontrado(pedir(SAMY, "/v1/estantes/delete/" + estante));
        noEncontrado(pedir(SAMY, "/v1/estantes/save", Map.of("id", estante, "nombre", "Mio")));
        String deSamy = pedir(SAMY, "/v1/estantes/save", Map.of("nombre", "De Samy")).get("object").get("id").asText();
        noEncontrado(pedir(SAMY, "/v1/estantes/" + deSamy + "/agregar", Map.of("ejemplarId", ejemplar)));
        assertThat(pedir(SAMY, "/v1/estantes/all").get("object")).hasSize(2);
    }

    @Test
    @DisplayName("ningun archivo se sirve a quien no tiene un ejemplar suyo: 404")
    void archivos() throws Exception {
        mvc.perform(get("/biblioteca/v1/archivos/" + archivo + "/libro.epub").contextPath("/biblioteca")
                .param("t", token(SAMY))).andExpect(status().isNotFound());
        mvc.perform(get("/biblioteca/v1/archivos/" + archivo + "/original").contextPath("/biblioteca")
                .param("t", token(SAMY))).andExpect(status().isNotFound());
        mvc.perform(get("/biblioteca/v1/archivos/" + archivo + "/libro.epub").contextPath("/biblioteca")
                .param("t", token(ANDERSON))).andExpect(status().isOk());
    }
}
