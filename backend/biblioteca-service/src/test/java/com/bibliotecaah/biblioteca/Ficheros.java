package com.bibliotecaah.biblioteca;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * (v1.6) Ficheros de prueba de los formatos nuevos, sin arrancar nada (las pruebas unitarias los usan sin
 * PostgreSQL). El nombre o la semilla cambian el contenido y por tanto el sha256.
 */
public final class Ficheros {

    private Ficheros() {}

    /** (v1.6) Un ZIP con esas entradas (nombre, contenido, nombre, contenido...). */
    public static byte[] zip(String... entradas) {
        try (ByteArrayOutputStream b = new ByteArrayOutputStream(); ZipOutputStream z = new ZipOutputStream(b)) {
            for (int i = 0; i + 1 < entradas.length; i += 2) {
                z.putNextEntry(entrada(entradas[i]));
                z.write(entradas[i + 1].getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
            z.finish();
            return b.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** (v1.6) Un OOXML minimo (DOCX, XLSX o PPTX segun el tipo de su parte principal). */
    public static byte[] ooxml(String tipoPrincipal, String semilla) {
        return zip("[Content_Types].xml", "<Types><Override PartName='/x.xml' "
                + "ContentType='application/vnd.openxmlformats-officedocument." + tipoPrincipal + "'/></Types>",
                "semilla.txt", semilla);
    }

    public static byte[] docx(String semilla) {
        return ooxml("wordprocessingml.document.main+xml", semilla);
    }

    public static byte[] xlsx(String semilla) {
        return ooxml("spreadsheetml.sheet.main+xml", semilla);
    }

    public static byte[] pptx(String semilla) {
        return ooxml("presentationml.presentation.main+xml", semilla);
    }

    /** (v1.6) Un ODF minimo: odt u ods segun el mimetype. */
    public static byte[] odf(String subtipo, String semilla) {
        return zip("mimetype", "application/vnd.oasis.opendocument." + subtipo, "content.xml", "<x>" + semilla + "</x>");
    }

    /**
     * (v1.6) Un fichero OLE (MS-CFB) minimo con un flujo de ese nombre ("WordDocument" = DOC,
     * "Workbook" = XLS): cabecera, un sector FAT y un sector de directorio de 512 bytes.
     */
    public static byte[] ole(String flujo, String semilla) {
        ByteBuffer b = ByteBuffer.allocate(512 * 4).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1});
        b.putShort(0x18, (short) 0x3E).putShort(0x1A, (short) 3).putShort(0x1C, (short) 0xFFFE)
                .putShort(0x1E, (short) 9).putShort(0x20, (short) 6)
                .putInt(0x2C, 1).putInt(0x30, 1).putInt(0x38, 4096).putInt(0x3C, -2).putInt(0x40, 0)
                .putInt(0x44, -2).putInt(0x48, 0).putInt(0x4C, 0);
        for (int i = 1; i < 109; i++) b.putInt(0x4C + i * 4, -1);
        for (int i = 0; i < 128; i++) b.putInt(512 + i * 4, i == 0 ? -3 : i == 1 ? -2 : -1);
        entradaOle(b, 1024, "Root Entry", 5);
        entradaOle(b, 1024 + 128, flujo, 2);
        byte[] s = semilla.getBytes(StandardCharsets.UTF_8);
        b.put(1536, s, 0, Math.min(s.length, 512));
        return b.array();
    }

    private static void entradaOle(ByteBuffer b, int en, String nombre, int tipo) {
        byte[] n = nombre.getBytes(StandardCharsets.UTF_16LE);
        b.put(en, n);
        b.putShort(en + 0x40, (short) (n.length + 2));
        b.put(en + 0x42, (byte) tipo);
    }

    /** Fecha fija: si no, el ZIP cambia cada segundo y el sha256 tambien. */
    private static ZipEntry entrada(String nombre) {
        ZipEntry e = new ZipEntry(nombre);
        e.setTime(946684800000L);
        return e;
    }
}
