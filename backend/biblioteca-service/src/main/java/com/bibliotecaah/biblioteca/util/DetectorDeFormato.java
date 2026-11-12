package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.enums.Formato;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Que formato es un fichero: por extension Y por sus bytes.
 *
 * La extension sola no basta (un .epub renombrado que es un PDF, una descarga
 * a medias). Se exige que coincidan los dos:
 *  · PDF por "%PDF-", RTF por "{\rtf", los de texto (TXT, MD, HTML, CSV, JSON,
 *    YAML, LOG) sin bytes nulos.
 *  · (v1.6) Los ZIP se distinguen por su CONTENIDO: EPUB (entrada mimetype o
 *    META-INF/container.xml), DOCX / XLSX / PPTX (el tipo de su parte principal
 *    en [Content_Types].xml), ODT / ODS (su entrada mimetype).
 *  · (v1.6) Los OLE (Office 97-2003) por los nombres de sus flujos:
 *    WordDocument (DOC) o Workbook / Book (XLS).
 * Compatibilidad: un EPUB, DOCX o DOC cuyo contenido no se puede leer o no se
 * reconoce sigue entrando como antes (por su firma) y el taller decide; solo se
 * rechaza si su contenido es CLARAMENTE de otro tipo. Los formatos nuevos
 * exigen que el contenido se reconozca.
 */
public final class DetectorDeFormato {

    /** Que hay dentro de un ZIP, segun su contenido. */
    enum TipoZip { EPUB, DOCX, XLSX, PPTX, ODT, ODS, OTRO, ILEGIBLE }

    /** Que hay dentro de un contenedor OLE (Office 97-2003). */
    enum TipoOle { DOC, XLS, OTRO, ILEGIBLE }

    private static final byte[] ZIP = {0x50, 0x4B, 0x03, 0x04};
    private static final byte[] OLE = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
            (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1};
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46, 0x2D}; // %PDF-
    private static final byte[] RTF = "{\\rtf".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] BOM_UTF8 = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final int CABECERA = 8192;
    private static final int LIMITE_PDF = 1024;
    /** Lo maximo que se lee de una entrada pequena del ZIP (mimetype, [Content_Types].xml). */
    private static final int MAX_ENTRADA_LEIDA = 256 * 1024;
    /** Sectores de directorio OLE que se recorren como mucho (un DOC/XLS normal usa 1-4). */
    private static final int MAX_SECTORES_DIRECTORIO = 4096;

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
            case "md", "markdown" -> Formato.MD;
            case "html", "htm", "xhtml" -> Formato.HTML;
            case "rtf" -> Formato.RTF;
            case "odt" -> Formato.ODT;
            case "pptx" -> Formato.PPTX;
            case "xlsx" -> Formato.XLSX;
            case "xls" -> Formato.XLS;
            case "ods" -> Formato.ODS;
            case "csv", "tsv" -> Formato.CSV;
            case "json" -> Formato.JSON;
            case "yaml", "yml" -> Formato.YAML;
            case "log" -> Formato.LOG;
            default -> null;
        };
    }

    /** ¿Los bytes del fichero (firma y, en ZIP y OLE, contenido) corresponden al formato esperado? */
    public static boolean coincide(Formato formato, Path fichero) throws IOException {
        byte[] cabecera;
        try (InputStream in = Files.newInputStream(fichero)) {
            cabecera = in.readNBytes(CABECERA);
        }
        if (!coincide(formato, cabecera)) return false;
        return switch (formato) {
            case EPUB -> compatible(tipoZip(fichero), TipoZip.EPUB);
            case DOCX -> compatible(tipoZip(fichero), TipoZip.DOCX);
            case XLSX -> tipoZip(fichero) == TipoZip.XLSX;
            case PPTX -> tipoZip(fichero) == TipoZip.PPTX;
            case ODT -> tipoZip(fichero) == TipoZip.ODT;
            case ODS -> tipoZip(fichero) == TipoZip.ODS;
            case DOC -> {
                TipoOle t = tipoOle(fichero);
                yield t == TipoOle.DOC || t == TipoOle.ILEGIBLE;
            }
            case XLS -> tipoOle(fichero) == TipoOle.XLS;
            default -> true;
        };
    }

    /** Solo la firma (los primeros bytes); el contenido de ZIP y OLE lo mira {@link #coincide(Formato, Path)}. */
    public static boolean coincide(Formato formato, byte[] cabecera) {
        if (cabecera.length == 0) return false;
        return switch (formato) {
            case EPUB, DOCX, XLSX, PPTX, ODT, ODS -> empiezaCon(cabecera, ZIP);
            case DOC, XLS -> empiezaCon(cabecera, OLE);
            case PDF -> contieneAlPrincipio(cabecera, PDF);
            case RTF -> empiezaCon(cabecera, RTF)
                    || (empiezaCon(cabecera, BOM_UTF8) && empiezaCon(Arrays.copyOfRange(cabecera, 3, cabecera.length), RTF));
            case TXT, MD, HTML, CSV, JSON, YAML, LOG -> esTexto(cabecera);
        };
    }

    /** EPUB y DOCX de siempre: entran si su contenido es el suyo o no se reconoce; no si es otra cosa. */
    private static boolean compatible(TipoZip visto, TipoZip esperado) {
        return visto == esperado || visto == TipoZip.ILEGIBLE || visto == TipoZip.OTRO;
    }

    // ------------------------------------------------------------------ ZIP

    static TipoZip tipoZip(Path fichero) {
        try (ZipFile zip = new ZipFile(fichero.toFile())) {
            ZipEntry mimetype = zip.getEntry("mimetype");
            if (mimetype != null) {
                String tipo = leer(zip, mimetype).trim();
                switch (tipo) {
                    case "application/epub+zip": return TipoZip.EPUB;
                    case "application/vnd.oasis.opendocument.text": return TipoZip.ODT;
                    case "application/vnd.oasis.opendocument.spreadsheet": return TipoZip.ODS;
                    default: break;
                }
            }
            ZipEntry tipos = zip.getEntry("[Content_Types].xml");
            if (tipos != null) {
                String xml = leer(zip, tipos);
                if (xml.contains("wordprocessingml.document.main+xml") || xml.contains("ms-word.document.macroEnabled.main+xml")) {
                    return TipoZip.DOCX;
                }
                if (xml.contains("spreadsheetml.sheet.main+xml") || xml.contains("ms-excel.sheet.macroEnabled.main+xml")) {
                    return TipoZip.XLSX;
                }
                if (xml.contains("presentationml.presentation.main+xml")
                        || xml.contains("ms-powerpoint.presentation.macroEnabled.main+xml")) {
                    return TipoZip.PPTX;
                }
                /* Generadores que no declaran los tipos: la parte principal en su sitio de siempre. */
                if (zip.getEntry("word/document.xml") != null) return TipoZip.DOCX;
                if (zip.getEntry("xl/workbook.xml") != null) return TipoZip.XLSX;
                if (zip.getEntry("ppt/presentation.xml") != null) return TipoZip.PPTX;
            }
            if (zip.getEntry("META-INF/container.xml") != null) return TipoZip.EPUB;
            return TipoZip.OTRO;
        } catch (IOException | RuntimeException e) {
            return TipoZip.ILEGIBLE;
        }
    }

    private static String leer(ZipFile zip, ZipEntry entrada) throws IOException {
        try (InputStream in = zip.getInputStream(entrada)) {
            return new String(in.readNBytes(MAX_ENTRADA_LEIDA), StandardCharsets.UTF_8);
        }
    }

    // ------------------------------------------------------------------ OLE (Compound File Binary)

    /**
     * Lee el directorio de un fichero OLE (MS-CFB): cabecera de 512 bytes,
     * tabla FAT localizada por la DIFAT (109 entradas en la cabecera y, si hace
     * falta, la cadena de sectores DIFAT) y la cadena de sectores del
     * directorio, con entradas de 128 bytes cuyo nombre va en UTF-16LE.
     * Cualquier incoherencia (indices fuera del fichero, bucles) = ILEGIBLE.
     */
    static TipoOle tipoOle(Path fichero) {
        try (FileChannel canal = FileChannel.open(fichero, StandardOpenOption.READ)) {
            long tamano = canal.size();
            ByteBuffer cab = leer(canal, 0, 512, tamano);
            if (cab == null) return TipoOle.ILEGIBLE;
            int desplazamiento = cab.getShort(0x1E) & 0xFFFF;
            if (desplazamiento != 9 && desplazamiento != 12) return TipoOle.ILEGIBLE;
            int sector = 1 << desplazamiento;
            int porSector = sector / 4;
            int[] sectoresFat = sectoresFat(canal, cab, sector, porSector, tamano);
            if (sectoresFat == null) return TipoOle.ILEGIBLE;

            Set<String> nombres = new HashSet<>();
            Set<Integer> vistos = new HashSet<>();
            int actual = cab.getInt(0x30);
            while (actual >= 0) {
                if (!vistos.add(actual) || vistos.size() > MAX_SECTORES_DIRECTORIO) return TipoOle.ILEGIBLE;
                ByteBuffer dir = leer(canal, (long) (actual + 1) << desplazamiento, sector, tamano);
                if (dir == null) return TipoOle.ILEGIBLE;
                for (int i = 0; i + 128 <= sector; i += 128) {
                    int largo = dir.getShort(i + 0x40) & 0xFFFF;
                    int tipo = dir.get(i + 0x42);
                    if (tipo == 0 || largo < 2 || largo > 64) continue;
                    byte[] nombre = new byte[largo - 2];
                    dir.get(i, nombre);
                    nombres.add(new String(nombre, StandardCharsets.UTF_16LE));
                }
                int indiceFat = actual / porSector;
                if (indiceFat >= sectoresFat.length) return TipoOle.ILEGIBLE;
                ByteBuffer fat = leer(canal, (long) (sectoresFat[indiceFat] + 1) << desplazamiento, sector, tamano);
                if (fat == null) return TipoOle.ILEGIBLE;
                actual = fat.getInt((actual % porSector) * 4);
            }
            if (nombres.contains("WordDocument")) return TipoOle.DOC;
            if (nombres.contains("Workbook") || nombres.contains("Book")) return TipoOle.XLS;
            return nombres.isEmpty() ? TipoOle.ILEGIBLE : TipoOle.OTRO;
        } catch (IOException | RuntimeException e) {
            return TipoOle.ILEGIBLE;
        }
    }

    /** Los sectores de la FAT: 109 en la cabecera y el resto en la cadena DIFAT. null si es incoherente. */
    private static int[] sectoresFat(FileChannel canal, ByteBuffer cab, int sector, int porSector, long tamano)
            throws IOException {
        int nFat = cab.getInt(0x2C);
        if (nFat <= 0 || nFat > 1_000_000) return null;
        int[] fat = new int[nFat];
        int n = 0;
        for (int i = 0; i < 109 && n < nFat; i++) {
            fat[n++] = cab.getInt(0x4C + i * 4);
        }
        int difat = cab.getInt(0x44);
        int saltos = 0;
        while (n < nFat && difat >= 0) {
            if (++saltos > 10_000) return null;
            ByteBuffer b = leer(canal, (long) (difat + 1) * sector, sector, tamano);
            if (b == null) return null;
            for (int i = 0; i < porSector - 1 && n < nFat; i++) {
                fat[n++] = b.getInt(i * 4);
            }
            difat = b.getInt((porSector - 1) * 4);
        }
        return n == nFat ? fat : null;
    }

    private static ByteBuffer leer(FileChannel canal, long posicion, int largo, long tamano) throws IOException {
        if (posicion < 0 || posicion + largo > tamano) return null;
        ByteBuffer b = ByteBuffer.allocate(largo).order(ByteOrder.LITTLE_ENDIAN);
        while (b.hasRemaining()) {
            if (canal.read(b, posicion + b.position()) < 0) return null;
        }
        b.flip();
        return b;
    }

    // ------------------------------------------------------------------ firmas y texto

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
