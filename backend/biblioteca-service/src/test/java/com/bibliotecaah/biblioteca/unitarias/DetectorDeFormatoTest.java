package com.bibliotecaah.biblioteca.unitarias;

import com.bibliotecaah.biblioteca.Ficheros;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.util.DetectorDeFormato;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("DetectorDeFormato (v1.6): extensiones nuevas y contenido de ZIP y OLE")
class DetectorDeFormatoTest {

    @TempDir
    Path tmp;

    private boolean coincide(Formato f, byte[] bytes) throws IOException {
        Path p = Files.write(tmp.resolve("f-" + System.nanoTime()), bytes);
        return DetectorDeFormato.coincide(f, p);
    }

    @Nested
    @DisplayName("Extensiones")
    class Extensiones {

        @Test
        @DisplayName("cada extension nueva va a su formato (y sus alias)")
        void nuevas() {
            assertThat(DetectorDeFormato.porExtension("notas.md")).isEqualTo(Formato.MD);
            assertThat(DetectorDeFormato.porExtension("notas.MARKDOWN")).isEqualTo(Formato.MD);
            assertThat(DetectorDeFormato.porExtension("p.htm")).isEqualTo(Formato.HTML);
            assertThat(DetectorDeFormato.porExtension("p.xhtml")).isEqualTo(Formato.HTML);
            assertThat(DetectorDeFormato.porExtension("p.html")).isEqualTo(Formato.HTML);
            assertThat(DetectorDeFormato.porExtension("c.rtf")).isEqualTo(Formato.RTF);
            assertThat(DetectorDeFormato.porExtension("c.odt")).isEqualTo(Formato.ODT);
            assertThat(DetectorDeFormato.porExtension("c.pptx")).isEqualTo(Formato.PPTX);
            assertThat(DetectorDeFormato.porExtension("h.xlsx")).isEqualTo(Formato.XLSX);
            assertThat(DetectorDeFormato.porExtension("h.xls")).isEqualTo(Formato.XLS);
            assertThat(DetectorDeFormato.porExtension("h.ods")).isEqualTo(Formato.ODS);
            assertThat(DetectorDeFormato.porExtension("h.csv")).isEqualTo(Formato.CSV);
            assertThat(DetectorDeFormato.porExtension("h.tsv")).isEqualTo(Formato.CSV);
            assertThat(DetectorDeFormato.porExtension("d.json")).isEqualTo(Formato.JSON);
            assertThat(DetectorDeFormato.porExtension("d.yml")).isEqualTo(Formato.YAML);
            assertThat(DetectorDeFormato.porExtension("d.yaml")).isEqualTo(Formato.YAML);
            assertThat(DetectorDeFormato.porExtension("d.log")).isEqualTo(Formato.LOG);
            assertThat(DetectorDeFormato.porExtension("macro.xlsm")).isNull();
            assertThat(DetectorDeFormato.porExtension("viejo.ppt")).isNull();
        }

        @Test
        @DisplayName("solo XLSX, XLS, ODS y CSV son hojas de calculo")
        void hojas() {
            assertThat(Arrays.stream(Formato.values()).filter(Formato::esHojaDeCalculo))
                    .containsExactly(Formato.XLSX, Formato.XLS, Formato.ODS, Formato.CSV);
        }
    }

    @Nested
    @DisplayName("ZIP por dentro")
    class Zip {

        @Test
        @DisplayName("DOCX, XLSX, PPTX, ODT y ODS se reconocen por su contenido y no se confunden")
        void reconoce() throws IOException {
            assertThat(coincide(Formato.XLSX, Ficheros.xlsx("a"))).isTrue();
            assertThat(coincide(Formato.PPTX, Ficheros.pptx("a"))).isTrue();
            assertThat(coincide(Formato.ODT, Ficheros.odf("text", "a"))).isTrue();
            assertThat(coincide(Formato.ODS, Ficheros.odf("spreadsheet", "a"))).isTrue();
            assertThat(coincide(Formato.DOCX, Ficheros.docx("a"))).isTrue();

            assertThat(coincide(Formato.XLSX, Ficheros.docx("a"))).isFalse();
            assertThat(coincide(Formato.PPTX, Ficheros.xlsx("a"))).isFalse();
            assertThat(coincide(Formato.ODS, Ficheros.odf("text", "a"))).isFalse();
            assertThat(coincide(Formato.ODT, Ficheros.zip("mimetype", "application/epub+zip"))).isFalse();
            assertThat(coincide(Formato.DOCX, Ficheros.xlsx("a"))).isFalse();
            assertThat(coincide(Formato.EPUB, Ficheros.pptx("a"))).isFalse();
            assertThat(coincide(Formato.DOCX, Ficheros.zip("mimetype", "application/epub+zip"))).isFalse();
        }

        @Test
        @DisplayName("EPUB por container.xml; los de siempre entran si su contenido no se reconoce o no se lee")
        void compatibilidad() throws IOException {
            assertThat(coincide(Formato.EPUB, Ficheros.zip("META-INF/container.xml", "<c/>"))).isTrue();
            assertThat(coincide(Formato.EPUB, Ficheros.zip("otra.txt", "x"))).isTrue();
            assertThat(coincide(Formato.DOCX, Ficheros.zip("otra.txt", "x"))).isTrue();
            byte[] roto = {0x50, 0x4B, 0x03, 0x04, 1, 2, 3};
            assertThat(coincide(Formato.EPUB, roto)).isTrue();
            assertThat(coincide(Formato.XLSX, roto)).isFalse();
            assertThat(coincide(Formato.XLSX, Ficheros.zip("mimetype", "application/zip"))).isFalse();
        }

        @Test
        @DisplayName("las variantes con macros se aceptan como su formato (las macros nunca se ejecutan)")
        void conMacros() throws IOException {
            byte[] xlsm = Ficheros.zip("[Content_Types].xml",
                    "<Types><Override ContentType='application/vnd.ms-excel.sheet.macroEnabled.main+xml'/></Types>");
            byte[] docm = Ficheros.zip("[Content_Types].xml",
                    "<Types><Override ContentType='application/vnd.ms-word.document.macroEnabled.main+xml'/></Types>");
            byte[] pptm = Ficheros.zip("[Content_Types].xml",
                    "<Types><Override ContentType='application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml'/></Types>");
            assertThat(coincide(Formato.XLSX, xlsm)).isTrue();
            assertThat(coincide(Formato.DOCX, docm)).isTrue();
            assertThat(coincide(Formato.PPTX, pptm)).isTrue();
            assertThat(coincide(Formato.PPTX, Ficheros.zip("[Content_Types].xml", "<Types/>"))).isFalse();
            /* Sin tipos declarados: por la parte principal. */
            assertThat(coincide(Formato.PPTX, Ficheros.zip("[Content_Types].xml", "<Types/>", "ppt/presentation.xml", "<p/>")))
                    .isTrue();
            assertThat(coincide(Formato.XLSX, Ficheros.zip("[Content_Types].xml", "<Types/>", "xl/workbook.xml", "<w/>")))
                    .isTrue();
            assertThat(coincide(Formato.DOCX, Ficheros.zip("[Content_Types].xml", "<Types/>", "word/document.xml", "<d/>")))
                    .isTrue();
            assertThat(coincide(Formato.XLSX, Ficheros.zip("[Content_Types].xml", "<Types/>", "word/document.xml", "<d/>")))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("OLE por dentro")
    class Ole {

        @Test
        @DisplayName("WordDocument es DOC y Workbook/Book es XLS; no se confunden")
        void reconoce() throws IOException {
            assertThat(coincide(Formato.DOC, Ficheros.ole("WordDocument", "a"))).isTrue();
            assertThat(coincide(Formato.XLS, Ficheros.ole("Workbook", "a"))).isTrue();
            assertThat(coincide(Formato.XLS, Ficheros.ole("Book", "a"))).isTrue();
            assertThat(coincide(Formato.XLS, Ficheros.ole("WordDocument", "a"))).isFalse();
            assertThat(coincide(Formato.DOC, Ficheros.ole("Workbook", "a"))).isFalse();
            assertThat(coincide(Formato.XLS, Ficheros.ole("PowerPoint Document", "a"))).isFalse();
        }

        @Test
        @DisplayName("un OLE ilegible o incoherente entra como DOC (como siempre) pero nunca como XLS")
        void ilegible() throws IOException {
            byte[] cabecera = Arrays.copyOf(Ficheros.ole("Workbook", "a"), 9);
            assertThat(coincide(Formato.DOC, cabecera)).isTrue();
            assertThat(coincide(Formato.XLS, cabecera)).isFalse();

            byte[] desplazamientoRaro = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(desplazamientoRaro).order(ByteOrder.LITTLE_ENDIAN).putShort(0x1E, (short) 7);
            assertThat(coincide(Formato.XLS, desplazamientoRaro)).isFalse();

            byte[] sinFat = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(sinFat).order(ByteOrder.LITTLE_ENDIAN).putInt(0x2C, 0);
            assertThat(coincide(Formato.XLS, sinFat)).isFalse();

            byte[] directorioFuera = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(directorioFuera).order(ByteOrder.LITTLE_ENDIAN).putInt(0x30, 99);
            assertThat(coincide(Formato.XLS, directorioFuera)).isFalse();

            byte[] bucle = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(bucle).order(ByteOrder.LITTLE_ENDIAN).putInt(512 + 4, 1);
            assertThat(coincide(Formato.XLS, bucle)).isFalse();

            byte[] fatFuera = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(fatFuera).order(ByteOrder.LITTLE_ENDIAN).putInt(0x4C, 50);
            assertThat(coincide(Formato.XLS, fatFuera)).isFalse();

            byte[] sinNombres = Ficheros.ole("Workbook", "a");
            ByteBuffer.wrap(sinNombres).order(ByteOrder.LITTLE_ENDIAN).put(1024 + 0x42, (byte) 0).put(1024 + 128 + 0x42, (byte) 0);
            assertThat(coincide(Formato.DOC, sinNombres)).isTrue();
            assertThat(coincide(Formato.XLS, sinNombres)).isFalse();
        }

        @Test
        @DisplayName("la FAT puede seguir en la cadena DIFAT; una DIFAT rota se rechaza")
        void difat() throws IOException {
            byte[] base = Ficheros.ole("Workbook", "a");
            ByteBuffer b = ByteBuffer.allocate(base.length + 512).order(ByteOrder.LITTLE_ENDIAN).put(base);
            /* 110 sectores FAT declarados: 109 en la cabecera (todos el sector 0) y el ultimo en un sector DIFAT (el 3). */
            b.putInt(0x2C, 110).putInt(0x44, 3).putInt(0x48, 1);
            for (int i = 0; i < 109; i++) b.putInt(0x4C + i * 4, 0);
            int difat = (3 + 1) * 512;
            b.putInt(difat, 0);
            for (int i = 1; i < 127; i++) b.putInt(difat + i * 4, -1);
            b.putInt(difat + 127 * 4, -2);
            assertThat(coincide(Formato.XLS, b.array())).isTrue();

            b.putInt(0x44, 40);
            assertThat(coincide(Formato.XLS, b.array())).isFalse();
        }
    }

    @Nested
    @DisplayName("Firmas y texto")
    class Firmas {

        @Test
        @DisplayName("RTF por {\\rtf (tambien tras una marca UTF-8); los de texto sin bytes nulos")
        void rtfYTexto() throws IOException {
            assertThat(coincide(Formato.RTF, "{\\rtf1\\ansi hola}".getBytes(StandardCharsets.US_ASCII))).isTrue();
            byte[] conBom = ("﻿{\\rtf1 hola}").getBytes(StandardCharsets.UTF_8);
            assertThat(coincide(Formato.RTF, conBom)).isTrue();
            assertThat(coincide(Formato.RTF, "hola".getBytes(StandardCharsets.US_ASCII))).isFalse();
            assertThat(coincide(Formato.RTF, new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF, 'x'})).isFalse();
            for (Formato f : new Formato[]{Formato.MD, Formato.HTML, Formato.CSV, Formato.JSON, Formato.YAML, Formato.LOG}) {
                assertThat(coincide(f, "# hola; a,b\n".getBytes(StandardCharsets.UTF_8))).as(f.name()).isTrue();
                assertThat(coincide(f, new byte[]{65, 0, 66})).as(f.name()).isFalse();
            }
            /* Un HTML solo tiene que ser texto: lo que haya dentro lo limpia el taller. */
            assertThat(coincide(Formato.HTML, "%PDF-1.7 %%EOF".getBytes(StandardCharsets.US_ASCII))).isTrue();
            assertThat(coincide(Formato.XLS, "PK".getBytes(StandardCharsets.US_ASCII))).isFalse();
        }
    }
}
