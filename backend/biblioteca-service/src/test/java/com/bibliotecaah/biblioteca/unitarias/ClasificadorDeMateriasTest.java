package com.bibliotecaah.biblioteca.unitarias;

import com.bibliotecaah.biblioteca.util.ClasificadorDeMaterias;
import com.bibliotecaah.biblioteca.util.ClasificadorDeMaterias.Clasificacion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ClasificadorDeMaterias: materias del archivo -> generos canonicos + etiquetas")
class ClasificadorDeMateriasTest {

    private static Clasificacion de(String... materias) {
        return ClasificadorDeMaterias.clasificar(Arrays.asList(materias));
    }

    @Nested
    @DisplayName("Los libros reales de Anderson")
    class Reales {

        @Test
        @DisplayName("\"Novela; Fantástico; Juvenil\" -> Fantasía + etiquetas Novela y Juvenil")
        void fantasticoJuvenil() {
            Clasificacion c = de("Novela; Fantástico; Juvenil");
            assertThat(c.generos()).containsExactly("Fantasía");
            assertThat(c.etiquetas()).containsExactly("Novela", "Juvenil");
        }

        @Test
        @DisplayName("\"Novela; Romántico\" -> Romance")
        void romantico() {
            assertThat(de("Novela; Romántico").generos()).containsExactly("Romance");
        }

        @Test
        @DisplayName("\"Novela, Intriga, Psicológico\" (con comas) -> Suspense, una sola vez")
        void intrigaPsicologico() {
            Clasificacion c = de("Novela, Intriga, Psicológico");
            assertThat(c.generos()).containsExactly("Suspense");
            assertThat(c.etiquetas()).containsExactly("Novela");
        }

        @Test
        @DisplayName("\"Relato; Fantástico\" -> Fantasía + etiqueta Relatos")
        void relato() {
            Clasificacion c = de("Relato; Fantástico");
            assertThat(c.generos()).containsExactly("Fantasía");
            assertThat(c.etiquetas()).containsExactly("Relatos");
        }

        @Test
        @DisplayName("\"Novela; Ciencia ficción; Fantástico; Juvenil\" -> Ciencia ficción y Fantasía")
        void cienciaFiccion() {
            Clasificacion c = de("Novela; Ciencia ficción; Fantástico; Juvenil");
            assertThat(c.generos()).containsExactly("Ciencia ficción", "Fantasía");
            assertThat(c.etiquetas()).containsExactly("Novela", "Juvenil");
        }

        @Test
        @DisplayName("\"Fantástico; Infantil; Juvenil; Novela\" -> Fantasía, sin Novela ni publico como genero")
        void infantil() {
            Clasificacion c = de("Fantástico; Infantil; Juvenil; Novela");
            assertThat(c.generos()).containsExactly("Fantasía");
            assertThat(c.etiquetas()).containsExactly("Infantil", "Juvenil", "Novela");
        }

        @Test
        @DisplayName("varios dc:subject sueltos se juntan y no se repiten")
        void variosSubject() {
            Clasificacion c = de("Novela", "Fantástico", "fantasia", "FANTASY");
            assertThat(c.generos()).containsExactly("Fantasía");
        }
    }

    @Nested
    @DisplayName("Tabla de sinonimos")
    class Tabla {

        @ParameterizedTest(name = "{0} -> {1}")
        @CsvSource(delimiter = '|', value = {
                "Romance|Romance", "romántica|Romance", "Thriller|Suspense", "suspense|Suspense",
                "Misterio|Suspense", "Policiaco|Policiaca", "Policíaco|Policiaca", "Crimen|Policiaca",
                "Novela negra|Policiaca", "Sci-Fi|Ciencia ficción", "CIENCIA FICCION|Ciencia ficción",
                "Distopía|Ciencia ficción", "Horror|Terror", "Histórico|Histórica", "Memorias|Biografía",
                "Autobiografía|Biografía", "Ensayo|Ensayo", "Self-help|Autoayuda", "Poemas|Poesía",
                "Teatro|Teatro", "Aventura|Aventuras", "Comedia|Humor", "Erótico|Erótica",
                "Literatura fantástica|Fantasía", "Relatos de terror|Terror", "Mystery & Detective|Suspense",
                "Clásicos|Clásicos", "Novela gráfica|Cómic", "Guerra|Bélica"})
        void sinonimos(String materia, String genero) {
            assertThat(de(materia).generos()).containsExactly(genero);
        }

        @Test
        @DisplayName("forma y publico nunca son generos")
        void formaYPublico() {
            Clasificacion c = de("Novela", "Relato", "Cuento", "Cuentos", "Juvenil", "Infantil", "Adulto",
                    "Young Adult", "Short stories");
            assertThat(c.generos()).isEmpty();
            assertThat(c.etiquetas()).containsExactly("Novela", "Relatos", "Juvenil", "Infantil", "Adulto");
        }

        @Test
        @DisplayName("lo generico se descarta: Ficción, Narrativa, General, Fiction / General")
        void genericos() {
            assertThat(de("Ficción", "Narrativa", "General", "Fiction / General", "Novela general").generos()).isEmpty();
        }

        @Test
        @DisplayName("compuestos: genero + publico, publico y publico, codigos BISAC con barras")
        void compuestos() {
            Clasificacion c = de("Fantasía juvenil", "Infantil y juvenil", "FICTION / Science Fiction / General",
                    "Ciencia ficción para adultos");
            assertThat(c.generos()).containsExactly("Fantasía", "Ciencia ficción");
            assertThat(c.etiquetas()).containsExactly("Juvenil", "Infantil", "Adulto");
        }

        @Test
        @DisplayName("lo desconocido se conserva limpio y con mayuscula inicial; codigos y basura fuera")
        void desconocidos() {
            Clasificacion c = de("  realismo   mágico. ", "COSTUMBRISMO", "Literatura española", "FIC009000", "863.64",
                    "x", "", "—", "a".repeat(101), "Viajes y algo raro");
            assertThat(c.generos()).containsExactly("Realismo mágico", "Costumbrismo", "Literatura española",
                    "Viajes y algo raro");
        }

        @Test
        @DisplayName("como mucho 10 generos, y null o vacio no rompe nada")
        void limites() {
            List<String> muchas = new ArrayList<>();
            for (int i = 0; i < 15; i++) muchas.add("Tema " + (char) ('a' + i));
            assertThat(ClasificadorDeMaterias.clasificar(muchas).generos()).hasSize(ClasificadorDeMaterias.MAX_GENEROS);
            assertThat(ClasificadorDeMaterias.clasificar(null).vacia()).isTrue();
            assertThat(de((String) null).vacia()).isTrue();
            assertThat(de("Novela").vacia()).isFalse();
        }
    }

    @Nested
    @DisplayName("Codificaciones raras")
    class Codificaciones {

        @Test
        @DisplayName("UTF-8 leido como Latin-1 (\"RomÃ¡ntico\") se repara")
        void mojibake() {
            assertThat(de("Novela; RomÃ¡ntico; FantÃ¡stico").generos()).containsExactly("Romance", "Fantasía");
            assertThat(de("Realismo mÃ¡gico").generos()).containsExactly("Realismo mágico");
        }

        @Test
        @DisplayName("un caracter perdido (\"Rom�ntico\") vale por cualquiera al buscar; si no se reconoce, se descarta")
        void caracterPerdido() {
            assertThat(de("Rom�ntico", "Fant�stico", "Ficci�n").generos())
                    .containsExactly("Romance", "Fantasía");
            assertThat(de("Hist�ria rara").generos()).isEmpty();
        }

        @Test
        @DisplayName("lo que parece mojibake pero no lo es se deja como estaba")
        void noEsMojibake() {
            assertThat(de("Ãrbol", "Ã€ la carte").generos()).containsExactly("Ãrbol", "Ã€ la carte");
        }
    }

    @Nested
    @DisplayName("Ediciones a mano")
    class Manual {

        @Test
        @DisplayName("los sinonimos pasan a su nombre canonico; lo demas (incluso Novela) se respeta; sin repetidos")
        void manual() {
            assertThat(ClasificadorDeMaterias.normalizarGeneros(
                    Arrays.asList("fantástico", "Fantasy", "Novela", " novela ", "Cuento", "Experimental", null, " ")))
                    .containsExactly("Fantasía", "Novela", "Cuento", "Experimental");
            assertThat(ClasificadorDeMaterias.normalizarGeneros(null)).isEmpty();
        }
    }
}
