package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.enums.Formato;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;

/**
 * Que formato es un fichero: por extension Y por sus primeros bytes ("magic").
 *
 * La extension sola no basta (un .epub renombrado que es un PDF, una descarga
 * a medias); los bytes solos tampoco distinguen un EPUB de un DOCX (los dos son
 * ZIP). Se exige que coincidan los dos.
 */
public final class DetectorDeFormato {

    private static final byte[] ZIP = {0x50, 0x4B, 0x03, 0x04};
    private static final byte[] OLE = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
            (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1};
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46, 0x2D}; // %PDF-
    private static final int CABECERA = 8192;
    private static final int LIMITE_PDF = 1024;

    private DetectorDeFormato() {}

    /** Formato segun la extension, o null si no es uno de los aceptados. */
    public static Formato porExtension(String nombre) {
        if (nombre == null) return null;
        int punto = nombre.lastIndexOf('.');
        if (punto < 0) return null;
        String ext = nombre.substring(punto + 1).toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "epub" -> Formato.EPUB;
            case "pdf" -> Formato.PDF;
            case "docx" -> Formato.DOCX;
            case "doc" -> Formato.DOC;
            case "txt" -> Formato.TXT;
            default -> null;
        };
    }

    /** ¿Los primeros bytes del fichero corresponden al formato esperado? */
    public static boolean coincide(Formato formato, Path fichero) throws IOException {
        byte[] cabecera;
        try (InputStream in = Files.newInputStream(fichero)) {
            cabecera = in.readNBytes(CABECERA);
        }
        return coincide(formato, cabecera);
    }

    public static boolean coincide(Formato formato, byte[] cabecera) {
        if (cabecera.length == 0) return false;
        return switch (formato) {
            case EPUB, DOCX -> empiezaCon(cabecera, ZIP);
            case DOC -> empiezaCon(cabecera, OLE);
            case PDF -> contieneAlPrincipio(cabecera, PDF);
            case TXT -> esTexto(cabecera);
        };
    }

    private static boolean empiezaCon(byte[] datos, byte[] prefijo) {
        return datos.length >= prefijo.length
                && Arrays.equals(Arrays.copyOf(datos, prefijo.length), prefijo);
    }

    private static boolean contieneAlPrincipio(byte[] datos, byte[] patron) {
        int hasta = Math.min(datos.length, LIMITE_PDF) - patron.length;
        for (int i = 0; i <= hasta; i++) {
            if (Arrays.equals(datos, i, i + patron.length, patron, 0, patron.length)) return true;
        }
        return false;
    }

    /**
     * Texto plano: sin bytes nulos (UTF-8 y Latin-1), o UTF-16 CON marca de orden
     * (FF FE / FE FF: lo que guarda el Bloc de notas como "Unicode"; el taller lo
     * decodifica, QA DA-15), o UTF-16 SIN marca reconocible: los ceros caen solo en
     * las posiciones pares (BE) o solo en las impares (LE) y son al menos la mitad
     * de los pares de bytes (texto latino; 8 pares como minimo). Un binario con ceros dispersos no cumple.
     */
    static boolean pareceUtf16SinMarca(byte[] datos) {
        int n = datos.length - (datos.length % 2);
        if (n < 16) return false;
        int cerosPares = 0;
        int cerosImpares = 0;
        for (int i = 0; i < n; i += 2) {
            if (datos[i] == 0 && datos[i + 1] == 0) return false;
            if (datos[i] == 0) cerosPares++;
            if (datos[i + 1] == 0) cerosImpares++;
        }
        int pares = n / 2;
        return (cerosPares == 0 && cerosImpares * 2 >= pares) || (cerosImpares == 0 && cerosPares * 2 >= pares);
    }

    static boolean esTexto(byte[] datos) {
        if (datos.length >= 2 && ((datos[0] == (byte) 0xFF && datos[1] == (byte) 0xFE)
                || (datos[0] == (byte) 0xFE && datos[1] == (byte) 0xFF))) {
            return true;
        }
        if (pareceUtf16SinMarca(datos)) {
            return true;
        }
        for (byte b : datos) {
            if (b == 0) return false;
        }
        return true;
    }
}
