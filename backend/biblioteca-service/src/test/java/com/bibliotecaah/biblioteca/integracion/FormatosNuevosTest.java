package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.Ficheros;
import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Formatos de documentos y hojas de calculo (contratos v1.6)")
class FormatosNuevosTest extends PostgresDeVerdad {

    private static byte[] utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private MockHttpServletRequestBuilder bajar(String ruta) {
        return get("/biblioteca" + ruta).contextPath("/biblioteca");
    }

    @Test
    @DisplayName("cada formato nuevo entra con su contenido real y queda con su formatoOriginal")
    void entranTodos() throws Exception {
        JsonNode r = subir(ANDERSON, "DOCUMENTO",
                new MockMultipartFile("archivos", "notas.md", "text/markdown", utf8("# Hola\n- [x] hecho")),
                new MockMultipartFile("archivos", "pagina.html", "text/html", utf8("<h1>Hola</h1>")),
                new MockMultipartFile("archivos", "carta.rtf", "application/rtf", utf8("{\\rtf1\\ansi Hola}")),
                new MockMultipartFile("archivos", "acta.odt", "application/octet-stream", Ficheros.odf("text", "acta")),
                new MockMultipartFile("archivos", "charla.pptx", "application/octet-stream", Ficheros.pptx("charla")),
                new MockMultipartFile("archivos", "cuentas.xlsx", "application/octet-stream", Ficheros.xlsx("cuentas")),
                new MockMultipartFile("archivos", "viejas.xls", "application/vnd.ms-excel", Ficheros.ole("Workbook", "v")),
                new MockMultipartFile("archivos", "libre.ods", "application/octet-stream", Ficheros.odf("spreadsheet", "l")),
                new MockMultipartFile("archivos", "datos.csv", "text/csv", utf8("a;b\n1;2")),
                new MockMultipartFile("archivos", "config.yml", "text/yaml", utf8("a: 1")),
                new MockMultipartFile("archivos", "datos.json", "application/json", utf8("{\"a\":1}")),
                new MockMultipartFile("archivos", "app.log", "text/plain", utf8("INFO arranque")));

        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        assertThat(r.get("message").asText()).isEqualTo("OK");
        List<String> formatos = new ArrayList<>();
        r.get("object").forEach(e -> formatos.add(e.get("formatoOriginal").asText()));
        assertThat(formatos).containsExactly("MD", "HTML", "RTF", "ODT", "PPTX", "XLSX", "XLS", "ODS", "CSV", "YAML",
                "JSON", "LOG");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = 'CONVERTIR'", Integer.class))
                .isEqualTo(12);
        JsonNode facetas = pedir(ANDERSON, "/v1/libros/facetas", java.util.Map.of("pestana", "DOCUMENTOS")).get("object");
        assertThat(facetas.get("formatos")).hasSize(12);
    }

    @Test
    @DisplayName("los ZIP y OLE disfrazados se rechazan: un .xlsx que es Word, un .xls que es Word, un .pptx que es un EPUB")
    void disfrazados() throws Exception {
        JsonNode r = subir(ANDERSON, "DOCUMENTO",
                new MockMultipartFile("archivos", "hoja.xlsx", "application/octet-stream", Ficheros.docx("x")),
                new MockMultipartFile("archivos", "hoja.xls", "application/octet-stream", Ficheros.ole("WordDocument", "x")),
                new MockMultipartFile("archivos", "charla.pptx", "application/octet-stream", epub("x")),
                new MockMultipartFile("archivos", "texto.odt", "application/octet-stream", Ficheros.odf("spreadsheet", "x")),
                new MockMultipartFile("archivos", "word.doc", "application/msword", Ficheros.ole("Workbook", "x")),
                new MockMultipartFile("archivos", "bueno.csv", "text/csv", utf8("a,b")));

        assertThat(r.get("object")).hasSize(1);
        assertThat(r.get("message").asText()).isEqualTo("Se agregaron 1 archivo(s). No se pudieron agregar: "
                + "\"hoja.xlsx\": no parece un XLSX válido (el contenido no coincide con la extensión). "
                + "\"hoja.xls\": no parece un XLS válido (el contenido no coincide con la extensión). "
                + "\"charla.pptx\": no parece un PPTX válido (el contenido no coincide con la extensión). "
                + "\"texto.odt\": no parece un ODT válido (el contenido no coincide con la extensión). "
                + "\"word.doc\": no parece un DOC válido (el contenido no coincide con la extensión).");
    }

    @Test
    @DisplayName("hoja.json: se sirve al dueno como JSON; ajeno, sin token o sin convertir no")
    void hojaJson() throws Exception {
        JsonNode e = subir(ANDERSON, "cuentas.xlsx", Ficheros.xlsx("cuentas")).get("object").get(0);
        UUID archivo = uuid(e.get("archivoId"));
        String ruta = "/v1/archivos/" + archivo + "/hoja.json";
        mvc.perform(bajar(ruta).param("t", token(ANDERSON))).andExpect(status().isNotFound());

        byte[] hoja = utf8("{\"versionFormato\":1,\"recortado\":false,\"hojas\":[]}");
        escribir(DATOS.resolve("normalizados/" + archivo + "/hoja.json"), hoja);
        mvc.perform(bajar(ruta).param("t", token(ANDERSON))).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/json"))
                .andExpect(content().bytes(hoja));
        mvc.perform(bajar(ruta).param("t", token(SAMY))).andExpect(status().isNotFound());
        mvc.perform(bajar(ruta)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("el original de un HTML se sirve como texto plano (nunca se pinta como pagina) y el de una hoja con su tipo")
    void originales() throws Exception {
        JsonNode html = subir(ANDERSON, "trampa.html", utf8("<script>alert(1)</script>")).get("object").get(0);
        mvc.perform(bajar("/v1/archivos/" + html.get("archivoId").asText() + "/original").param("t", token(ANDERSON)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain;charset=UTF-8"));
        JsonNode xlsx = subir(ANDERSON, "cuentas.xlsx", Ficheros.xlsx("c")).get("object").get(0);
        mvc.perform(bajar("/v1/archivos/" + xlsx.get("archivoId").asText() + "/original").param("t", token(ANDERSON)))
                .andExpect(header().string("Content-Type",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }
}
