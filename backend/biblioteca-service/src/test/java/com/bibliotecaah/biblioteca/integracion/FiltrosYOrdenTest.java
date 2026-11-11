package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Mi Biblioteca: pestanas, filtros combinables, orden, paginas y facetas")
class FiltrosYOrdenTest extends PostgresDeVerdad {

    private String quijote;
    private String rayuela;
    private String aleph;
    private String contrato;
    private String deseo;

    @BeforeEach
    void biblioteca() throws Exception {
        quijote = libro("quijote.epub", Map.of("titulo", "El Quijote", "autores", List.of("Miguel de Cervantes"),
                "anio", 1605, "generos", List.of("Novela"), "etiquetas", List.of("clasico"), "calificacion", 5.0,
                "estado", "LEIDO", "sinopsis", "Un hidalgo de La Mancha"));
        rayuela = libro("rayuela.epub", Map.of("titulo", "Rayuela", "autores", List.of("Julio Cortázar"),
                "anio", 1963, "generos", List.of("Novela", "Experimental"), "calificacion", 4.0, "estado", "LEYENDO"));
        aleph = libro("aleph.pdf", Map.of("titulo", "El Aleph", "autores", List.of("Jorge Luis Borges"),
                "anio", 1949, "generos", List.of("Cuento"), "favorito", true));
        contrato = subir(ANDERSON, "DOCUMENTO", new org.springframework.mock.web.MockMultipartFile(
                "archivos", "contrato.pdf", "application/pdf", pdf("contrato"))).get("object").get(0).get("id").asText();
        deseo = pedir(ANDERSON, "/v1/libros/deseo", Map.of("titulo", "Pedro Páramo", "autor", "Juan Rulfo"))
                .get("object").get("id").asText();
        pedir(ANDERSON, "/v1/anotaciones/save", Map.of("ejemplarId", rayuela, "tipo", "NOTA", "nota", "x"));
        pedir(ANDERSON, "/v1/progreso/save", Map.of("ejemplarId", rayuela, "porcentaje", 55.0));
        subirLibro(SAMY, "de-samy.epub");
    }

    private String libro(String nombre, Map<String, Object> datos) throws Exception {
        JsonNode e = nombre.endsWith(".pdf")
                ? subir(ANDERSON, nombre, pdf(nombre)).get("object").get(0)
                : subirLibro(ANDERSON, nombre);
        Map<String, Object> cuerpo = new HashMap<>(datos);
        cuerpo.put("id", e.get("id").asText());
        pedir(ANDERSON, "/v1/libros/save", cuerpo);
        return e.get("id").asText();
    }

    private List<String> ids(Map<String, Object> filtro) throws Exception {
        JsonNode r = pedir(ANDERSON, "/v1/libros/all", filtro);
        List<String> ids = new ArrayList<>();
        r.get("object").get("list").forEach(n -> ids.add(n.get("id").asText()));
        return ids;
    }

    @Nested
    @DisplayName("Pestanas")
    class Pestanas {

        @Test
        @DisplayName("TODO (por defecto) excluye deseos y lo de otros usuarios; RECIENTES primero")
        void todo() throws Exception {
            assertThat(ids(Map.of())).containsExactly(contrato, aleph, rayuela, quijote);
            JsonNode r = pedir(ANDERSON, "/v1/libros/all");
            assertThat(r.get("object").get("totalElements").asLong()).isEqualTo(4);
        }

        @Test
        @DisplayName("cada pestana filtra lo suyo")
        void cadaUna() throws Exception {
            assertThat(ids(Map.of("pestana", "LEYENDO"))).containsExactly(rayuela);
            assertThat(ids(Map.of("pestana", "POR_LEER"))).containsExactly(contrato, aleph);
            assertThat(ids(Map.of("pestana", "LEIDOS"))).containsExactly(quijote);
            assertThat(ids(Map.of("pestana", "FAVORITOS"))).containsExactly(aleph);
            assertThat(ids(Map.of("pestana", "DESEOS"))).containsExactly(deseo);
            assertThat(ids(Map.of("pestana", "DOCUMENTOS"))).containsExactly(contrato);
            assertThat(ids(Map.of("pestana", "TODO"))).hasSize(4);
        }
    }

    @Nested
    @DisplayName("Filtros")
    class Filtros {

        @Test
        @DisplayName("texto sin tildes ni mayusculas busca en titulo, autor y sinopsis")
        void texto() throws Exception {
            assertThat(ids(Map.of("texto", "CORTAZAR"))).containsExactly(rayuela);
            assertThat(ids(Map.of("texto", "mancha"))).containsExactly(quijote);
            assertThat(ids(Map.of("texto", "100%_"))).isEmpty();
        }

        @Test
        @DisplayName("autores, generos, etiquetas y formatos")
        void listas() throws Exception {
            assertThat(ids(Map.of("autores", List.of("Jorge Luis Borges", "Julio Cortázar")))).containsExactly(aleph, rayuela);
            assertThat(ids(Map.of("generos", List.of("Novela")))).containsExactly(rayuela, quijote);
            assertThat(ids(Map.of("etiquetas", List.of("clasico")))).containsExactly(quijote);
            assertThat(ids(Map.of("formatos", List.of("pdf")))).containsExactly(contrato, aleph);
        }

        @Test
        @DisplayName("rango de anios, calificacion minima y con/sin notas")
        void rangos() throws Exception {
            assertThat(ids(Map.of("anioDesde", 1900, "anioHasta", 1960))).containsExactly(aleph);
            assertThat(ids(Map.of("calificacionMin", 4.5))).containsExactly(quijote);
            assertThat(ids(Map.of("conNotas", true))).containsExactly(rayuela);
            assertThat(ids(Map.of("conNotas", false))).containsExactly(contrato, aleph, quijote);
        }
    }

    @Nested
    @DisplayName("Orden y paginas")
    class Orden {

        @Test
        @DisplayName("cada criterio de orden")
        void criterios() throws Exception {
            assertThat(ids(Map.of("orden", "ANTIGUOS"))).containsExactly(quijote, rayuela, aleph, contrato);
            assertThat(ids(Map.of("orden", "TITULO"))).containsExactly(contrato, aleph, quijote, rayuela);
            assertThat(ids(Map.of("orden", "AUTOR"))).containsExactly(aleph, rayuela, quijote, contrato);
            assertThat(ids(Map.of("orden", "ANIO"))).containsExactly(rayuela, aleph, quijote, contrato);
            assertThat(ids(Map.of("orden", "PROGRESO")).get(0)).isEqualTo(rayuela);
            assertThat(ids(Map.of("orden", "CALIFICACION")).subList(0, 2)).containsExactly(quijote, rayuela);
            assertThat(ids(Map.of("orden", "ULTIMO_ABIERTO")).get(0)).isEqualTo(rayuela);
            assertThat(ids(Map.of("orden", "RECIENTES")).get(0)).isEqualTo(contrato);
        }

        @Test
        @DisplayName("paginas: tamano, total de paginas y limites")
        void paginas() throws Exception {
            JsonNode p = pedir(ANDERSON, "/v1/libros/all", Map.of("page", 1, "size", 3)).get("object");
            assertThat(p.get("page").asInt()).isEqualTo(1);
            assertThat(p.get("size").asInt()).isEqualTo(3);
            assertThat(p.get("totalPage").asInt()).isEqualTo(2);
            assertThat(p.get("list")).hasSize(1);
            JsonNode limites = pedir(ANDERSON, "/v1/libros/all", Map.of("page", -4, "size", 5000)).get("object");
            assertThat(limites.get("page").asInt()).isZero();
            assertThat(limites.get("size").asInt()).isEqualTo(200);
            assertThat(pedir(ANDERSON, "/v1/libros/all", Map.of("size", 0)).get("object").get("size").asInt()).isEqualTo(30);
        }
    }

    @Test
    @DisplayName("facetas con su cuenta, solo de mis libros")
    void facetas() throws Exception {
        JsonNode f = pedir(ANDERSON, "/v1/libros/facetas").get("object");

        assertThat(f.get("generos").get(0).get("nombre").asText()).isEqualTo("Novela");
        assertThat(f.get("generos").get(0).get("n").asInt()).isEqualTo(2);
        assertThat(f.get("autores")).hasSize(4);
        assertThat(f.get("anios").get(0).get("nombre").asText()).isEqualTo("1963");
        assertThat(f.get("formatos").get(0).get("nombre").asText()).isEqualTo("EPUB");
        assertThat(f.get("formatos").get(0).get("n").asInt()).isEqualTo(2);
        assertThat(f.get("etiquetas").get(0).get("nombre").asText()).isEqualTo("clasico");
    }
}
