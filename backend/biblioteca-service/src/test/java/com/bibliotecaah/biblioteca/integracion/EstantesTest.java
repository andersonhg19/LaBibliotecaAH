package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Estantes: favoritos de sistema, colecciones y orden fraccional")
class EstantesTest extends PostgresDeVerdad {

    private String a;
    private String b;
    private String c;
    private String estante;

    @BeforeEach
    void tresLibros() throws Exception {
        a = subirLibro(ANDERSON, "a.epub").get("id").asText();
        b = subirLibro(ANDERSON, "b.epub").get("id").asText();
        c = subirLibro(ANDERSON, "c.epub").get("id").asText();
        estante = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Clasicos", "colorMadera", "roble"))
                .get("object").get("id").asText();
        for (String id : List.of(a, b, c)) {
            pedir(ANDERSON, "/v1/estantes/" + estante + "/agregar", Map.of("ejemplarId", id));
        }
    }

    private List<String> orden() throws Exception {
        List<String> ids = new ArrayList<>();
        pedir(ANDERSON, "/v1/estantes/" + estante + "/libros").get("object").forEach(n -> ids.add(n.get("id").asText()));
        return ids;
    }

    @Nested
    @DisplayName("Gestion")
    class Gestion {

        @Test
        @DisplayName("all crea FAVORITOS solo una vez y lo pone primero, con la cuenta de libros")
        void favoritosDeSistema() throws Exception {
            JsonNode todos = pedir(ANDERSON, "/v1/estantes/all").get("object");
            pedir(ANDERSON, "/v1/estantes/all");

            assertThat(todos).hasSize(2);
            assertThat(todos.get(0).get("tipo").asText()).isEqualTo("FAVORITOS");
            assertThat(todos.get(0).get("nombre").asText()).isEqualTo("Favoritos");
            assertThat(todos.get(1).get("nLibros").asInt()).isEqualTo(3);
            assertThat(todos.get(1).get("colorMadera").asText()).isEqualTo("roble");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_estante WHERE tipo = 'FAVORITOS'", Integer.class))
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("un nombre repetido (sin importar mayusculas) responde 101; renombrar el propio si se puede")
        void duplicado() throws Exception {
            JsonNode r = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "CLASICOS"));
            assertThat(r.get("errorCode").asInt()).isEqualTo(101);
            assertThat(r.get("message").asText()).isEqualTo("Ya tienes un estante llamado \"CLASICOS\".");
            JsonNode mismo = pedir(ANDERSON, "/v1/estantes/save", Map.of("id", estante, "nombre", "Clasicos", "colorMadera", "cedro"));
            assertThat(mismo.get("object").get("colorMadera").asText()).isEqualTo("cedro");
        }

        @Test
        @DisplayName("FAVORITOS no se renombra ni se borra (120); una coleccion si se borra")
        void favoritosProtegido() throws Exception {
            String fav = pedir(ANDERSON, "/v1/estantes/all").get("object").get(0).get("id").asText();
            JsonNode renombrar = pedir(ANDERSON, "/v1/estantes/save", Map.of("id", fav, "nombre", "Mis joyas"));
            assertThat(renombrar.get("errorCode").asInt()).isEqualTo(120);
            assertThat(renombrar.get("message").asText()).isEqualTo("El estante de favoritos no se puede renombrar.");
            assertThat(pedir(ANDERSON, "/v1/estantes/save", Map.of("id", fav, "nombre", "Favoritos", "colorMadera", "nogal"))
                    .get("correct").asBoolean()).isTrue();
            assertThat(pedir(ANDERSON, "/v1/estantes/delete/" + fav).get("message").asText())
                    .isEqualTo("El estante de favoritos no se puede borrar.");
            assertThat(pedir(ANDERSON, "/v1/estantes/delete/" + estante).get("object").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar", Integer.class)).isEqualTo(3);
        }

        @Test
        @DisplayName("agregar dos veces no duplica; quitar lo saca; un estante vacio lista vacio")
        void agregarYQuitar() throws Exception {
            pedir(ANDERSON, "/v1/estantes/" + estante + "/agregar", Map.of("ejemplarId", a));
            assertThat(orden()).containsExactly(a, b, c);
            assertThat(pedir(ANDERSON, "/v1/estantes/" + estante + "/quitar", Map.of("ejemplarId", b))
                    .get("object").asBoolean()).isTrue();
            assertThat(orden()).containsExactly(a, c);
            String vacio = pedir(ANDERSON, "/v1/estantes/save", Map.of("nombre", "Vacio")).get("object").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/estantes/" + vacio + "/libros").get("object")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Ordenar")
    class Ordenar {

        @Test
        @DisplayName("antes de, despues de y al final")
        void moverse() throws Exception {
            pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", c, "antesDe", a));
            assertThat(orden()).containsExactly(c, a, b);
            pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", c, "despuesDe", a));
            assertThat(orden()).containsExactly(a, c, b);
            pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", a, "despuesDe", b));
            assertThat(orden()).containsExactly(c, b, a);
            pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", c));
            assertThat(orden()).containsExactly(b, a, c);
            pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", a, "antesDe", c));
            assertThat(orden()).containsExactly(b, a, c);
        }

        @Test
        @DisplayName("cien movimientos al mismo hueco fuerzan una renumeracion y el orden sigue correcto")
        void renumera() throws Exception {
            for (int i = 0; i < 100; i++) {
                String movido = i % 2 == 0 ? c : b;
                String fijo = i % 2 == 0 ? b : c;
                pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", movido, "despuesDe", a));
                assertThat(orden().get(1)).isEqualTo(movido);
                assertThat(orden().get(2)).isEqualTo(fijo);
            }
            Double minimo = jdbc.queryForObject("SELECT MIN(orden) FROM bah_lib_estante_item WHERE estante_id = ?::uuid",
                    Double.class, estante);
            assertThat(minimo).isEqualTo(1.0);
        }

        @Test
        @DisplayName("un libro que no esta en el estante, o una referencia que no esta, responde 102")
        void noEsta() throws Exception {
            String d = subirLibro(ANDERSON, "d.epub").get("id").asText();
            assertThat(pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar", Map.of("ejemplarId", d))
                    .get("message").asText()).isEqualTo("Ese libro no está en este estante.");
            assertThat(pedir(ANDERSON, "/v1/estantes/" + estante + "/ordenar",
                    Map.of("ejemplarId", a, "antesDe", UUID.randomUUID().toString()))
                    .get("message").asText()).isEqualTo("El libro de referencia no está en este estante.");
        }
    }
}
