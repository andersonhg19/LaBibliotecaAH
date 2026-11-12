package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.entity.Carpeta;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Piezas sueltas de v1.6: tipos de los originales y el arbol de carpetas")
class TiposYCarpetasUnitariaTest {

    @Test
    @DisplayName("cada formato se sirve con su tipo; lo que es texto, como texto plano")
    void tipos() {
        Map<Formato, String> esperado = new HashMap<>();
        esperado.put(Formato.EPUB, "application/epub+zip");
        esperado.put(Formato.PDF, "application/pdf");
        esperado.put(Formato.DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        esperado.put(Formato.DOC, "application/msword");
        esperado.put(Formato.TXT, "text/plain;charset=UTF-8");
        esperado.put(Formato.MD, "text/plain;charset=UTF-8");
        esperado.put(Formato.HTML, "text/plain;charset=UTF-8");
        esperado.put(Formato.JSON, "text/plain;charset=UTF-8");
        esperado.put(Formato.YAML, "text/plain;charset=UTF-8");
        esperado.put(Formato.LOG, "text/plain;charset=UTF-8");
        esperado.put(Formato.CSV, "text/csv;charset=UTF-8");
        esperado.put(Formato.RTF, "application/rtf");
        esperado.put(Formato.ODT, "application/vnd.oasis.opendocument.text");
        esperado.put(Formato.ODS, "application/vnd.oasis.opendocument.spreadsheet");
        esperado.put(Formato.PPTX, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        esperado.put(Formato.XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        esperado.put(Formato.XLS, "application/vnd.ms-excel");
        assertThat(esperado).hasSize(Formato.values().length);
        for (Formato f : Formato.values()) {
            assertThat(ArchivoServiceImpl.tipoDe(f).toString()).as(f.name()).isEqualTo(esperado.get(f));
        }
    }

    @Nested
    @DisplayName("Carpetas")
    class Carpetas {

        private Carpeta c(UUID id, UUID padre, String nombre) {
            return Carpeta.builder().id(id).usuarioId(1L).padreId(padre).nombre(nombre).build();
        }

        @Test
        @DisplayName("nombres libres: (2), (3)... sin pasar de 100 caracteres; limpieza de espacios y controles")
        void nombres() {
            Set<String> ocupados = new HashSet<>(Set.of("informe", "informe (2)"));
            assertThat(CarpetaServiceImpl.nombreLibre("Informe", ocupados)).isEqualTo("Informe (3)");
            assertThat(CarpetaServiceImpl.nombreLibre("Otro", ocupados)).isEqualTo("Otro");
            String largo = "x".repeat(100);
            Set<String> conLargo = new HashSet<>(Set.of(largo));
            assertThat(CarpetaServiceImpl.nombreLibre(largo, conLargo)).hasSize(100).endsWith(" (2)");
            assertThat(CarpetaServiceImpl.limpiarNombre(" a\u0007  b\n")).isEqualTo("a b");
            assertThat(CarpetaServiceImpl.normalizar("Cotización ÁRBOL")).isEqualTo("cotizacion arbol");
        }

        @Test
        @DisplayName("el arbol aguanta un ciclo en la base sin colgarse y trata un padre perdido como raiz")
        void ciclo() {
            UUID a = UUID.randomUUID();
            UUID b = UUID.randomUUID();
            UUID huerfana = UUID.randomUUID();
            CarpetaServiceImpl.Arbol arbol = new CarpetaServiceImpl.Arbol(
                    List.of(c(a, b, "A"), c(b, a, "B"), c(huerfana, UUID.randomUUID(), "H")), Map.of());
            assertThat(arbol.subarbol(a)).containsExactlyInAnyOrder(a, b);
            assertThat(arbol.profundidad(a)).isLessThanOrEqualTo(4);
            assertThat(arbol.ruta(a)).hasSizeLessThanOrEqualTo(4);
            assertThat(arbol.altura(a)).isGreaterThan(0);
            assertThat(arbol.hijos(null)).extracting(Carpeta::getNombre).containsExactly("H");
            assertThat(arbol.profundidad(huerfana)).isEqualTo(1);
            List<String> visitadas = new java.util.ArrayList<>();
            arbol.enProfundidad(a, x -> visitadas.add(x.getNombre()));
            assertThat(visitadas).containsExactly("B", "A");
            assertThatThrownBy(() -> arbol.exigir(UUID.randomUUID())).isInstanceOf(ValidationException.class);
        }
    }
}
