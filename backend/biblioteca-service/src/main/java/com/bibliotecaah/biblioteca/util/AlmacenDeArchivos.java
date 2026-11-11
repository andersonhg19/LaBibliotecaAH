package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.exception.DatosNoDisponiblesException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermissions;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * La carpeta /datos (contratos.md §2). Unico sitio que conoce su estructura.
 *
 * Si la raiz no existe (disco USB desconectado) {@link #exigirDisponible()}
 * lanza DatosNoDisponiblesException: la API sigue respondiendo para todo lo que
 * vive en la base de datos y los binarios contestan 503.
 */
@Slf4j
@Component
public class AlmacenDeArchivos {

    private final Path raiz;

    public AlmacenDeArchivos(@Value("${biblioteca.datos}") String raiz) {
        this.raiz = Paths.get(raiz).toAbsolutePath().normalize();
    }

    public Path raiz() {
        return raiz;
    }

    public boolean disponible() {
        return Files.isDirectory(raiz);
    }

    public void exigirDisponible() {
        if (!disponible()) {
            log.error("La carpeta de datos {} no esta disponible", raiz);
            throw new DatosNoDisponiblesException();
        }
    }

    /**
     * Bytes libres en el disco de /datos (QA SE-07). Si no se puede saber, se
     * devuelve Long.MAX_VALUE y queda en el log: no saber el espacio no debe
     * impedir subir.
     */
    public long espacioLibre() {
        try {
            return Files.getFileStore(raiz).getUsableSpace();
        } catch (IOException e) {
            log.warn("No se pudo medir el espacio libre de {}: {}", raiz, e.getMessage());
            return Long.MAX_VALUE;
        }
    }

    public Path carpetaOriginal(UUID archivoId) {
        return raiz.resolve("originales").resolve(archivoId.toString());
    }

    public Path normalizado(UUID archivoId, String nombre) {
        return raiz.resolve("normalizados").resolve(archivoId.toString()).resolve(nombre);
    }

    /** normalizados/{archivoId}/frases/cap-NNN.json (contratos.md §5). */
    public Path frases(UUID archivoId, int capitulo) {
        return normalizado(archivoId, "frases").resolve(String.format("cap-%03d.json", capitulo));
    }

    /**
     * normalizados/{archivoId}/traducciones/{destino}/cap-NNN.json (contratos v1.3): compartido por
     * archivo, no por usuario. Vive dentro de normalizados/{archivoId}, asi que se borra con el archivo.
     */
    public Path traduccion(UUID archivoId, String destino, int capitulo) {
        return normalizado(archivoId, "traducciones").resolve(destino).resolve(String.format("cap-%03d.json", capitulo));
    }

    public Path audio(UUID archivoId, String vozId, String nombre) {
        return raiz.resolve("audio").resolve(archivoId.toString()).resolve(vozId).resolve(nombre);
    }

    public Path muestra(String vozId) {
        return raiz.resolve("muestras").resolve(vozId + ".mp3");
    }

    public Path buzon() {
        return raiz.resolve("buzon");
    }

    /**
     * Fichero temporal dentro de /datos/tmp (mismo disco que el destino: mover es instantaneo).
     * createTempFile lo crea 0600; se abre a 0644 para que el taller (otro proceso) pueda leer
     * el original una vez movido. En sistemas sin POSIX (Windows en local) se deja como esta.
     */
    public Path temporal() throws IOException {
        Path tmp = raiz.resolve("tmp");
        Files.createDirectories(tmp);
        Path fichero = Files.createTempFile(tmp, "subida-", ".part");
        try {
            Files.setPosixFilePermissions(fichero, PosixFilePermissions.fromString("rw-r--r--"));
        } catch (UnsupportedOperationException sinPosix) {
            log.debug("El sistema de archivos no admite permisos POSIX: {}", tmp);
        }
        return fichero;
    }

    /** Borra originales, normalizados y audio de un archivo. Nunca lanza: deja log. */
    public void borrarTodoDe(UUID archivoId) {
        if (!disponible()) {
            log.warn("No se borran los ficheros de {}: la carpeta de datos no esta disponible", archivoId);
            return;
        }
        for (String zona : new String[]{"originales", "normalizados", "audio"}) {
            borrarArbol(raiz.resolve(zona).resolve(archivoId.toString()));
        }
    }

    public static void borrarArbol(Path carpeta) {
        if (!Files.exists(carpeta)) return;
        try (Stream<Path> arbol = Files.walk(carpeta)) {
            arbol.sorted(Comparator.reverseOrder()).forEach(AlmacenDeArchivos::borrarUno);
        } catch (IOException e) {
            log.warn("No se pudo recorrer {}: {}", carpeta, e.getMessage());
        }
    }

    private static void borrarUno(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException e) {
            log.warn("No se pudo borrar {}: {}", p, e.getMessage());
        }
    }

    /**
     * Nombre de fichero seguro: sin tildes, sin separadores ni caracteres raros,
     * con su extension y como mucho 120 caracteres.
     */
    public static String sanear(String nombre) {
        String base = nombre == null ? "" : nombre;
        int barra = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        if (barra >= 0) base = base.substring(barra + 1);
        base = Normalizer.normalize(base, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        base = base.replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("_+", "_");
        base = base.replaceAll("^[._]+", "");
        if (base.isBlank()) base = "archivo";
        if (base.length() > 120) {
            int punto = base.lastIndexOf('.');
            String ext = punto > 0 && base.length() - punto <= 6 ? base.substring(punto) : "";
            base = base.substring(0, 120 - ext.length()) + ext;
        }
        return base;
    }
}
