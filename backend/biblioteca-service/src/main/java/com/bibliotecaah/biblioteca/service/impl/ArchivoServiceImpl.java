package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.ArchivoRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.service.ArchivoService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Que fichero se sirve. Orden de comprobaciones, a proposito:
 *  1. DUENO: el usuario tiene un ejemplar con ese archivo (si no, "no existe":
 *     no se confirma que el archivo de otro exista).
 *  2. /datos montado (si no, 503).
 *  3. el fichero existe (si no, 404).
 * Los nombres que llegan por la URL se validan contra patrones cerrados: nada
 * de "..", barras ni rutas arbitrarias.
 */
@Service
public class ArchivoServiceImpl implements ArchivoService {

    public static final MediaType EPUB = MediaType.parseMediaType("application/epub+zip");
    public static final MediaType M4A = MediaType.parseMediaType("audio/mp4");
    public static final MediaType MP3 = MediaType.parseMediaType("audio/mpeg");

    static final Pattern FICHERO_DE_AUDIO = Pattern.compile("^cap-(\\d{3})(-2x\\.m4a|\\.m4a|\\.tiempos\\.json)$");

    private final ArchivoRepository archivos;
    private final EjemplarRepository ejemplares;
    private final AlmacenDeArchivos almacen;

    public ArchivoServiceImpl(ArchivoRepository archivos, EjemplarRepository ejemplares, AlmacenDeArchivos almacen) {
        this.archivos = archivos;
        this.ejemplares = ejemplares;
        this.almacen = almacen;
    }

    @Override
    public Binario libro(UUID archivoId) {
        exigirDueno(archivoId);
        return existente(almacen.normalizado(archivoId, "libro.epub"), EPUB, null);
    }

    @Override
    public Binario portada(UUID archivoId) {
        exigirDueno(archivoId);
        return existente(almacen.normalizado(archivoId, "portada.jpg"), MediaType.IMAGE_JPEG, null);
    }

    @Override
    public Binario original(UUID archivoId) {
        exigirDueno(archivoId);
        Archivo a = ValidationUtils.encontrado(archivos.findById(archivoId), Message.Msj.archivoNoEncontrado);
        almacen.exigirDisponible();
        Path ruta = almacen.raiz().resolve(a.getRutaOriginal()).normalize();
        ValidationUtils.exigir(ruta.startsWith(almacen.raiz()), Message.Msj.archivoNoEncontrado, CodigoError.NO_ENCONTRADO);
        return existente(ruta, tipoDe(a.getFormatoOriginal()), ruta.getFileName().toString());
    }

    @Override
    public Binario audio(UUID archivoId, String vozId, String fichero) {
        exigirDueno(archivoId);
        ValidationUtils.vozId(vozId);
        Matcher m = FICHERO_DE_AUDIO.matcher(fichero == null ? "" : fichero);
        ValidationUtils.exigir(m.matches(), Message.Msj.archivoNoEncontrado, CodigoError.NO_ENCONTRADO);
        MediaType tipo = m.group(2).endsWith(".json") ? MediaType.APPLICATION_JSON : M4A;
        return existente(almacen.audio(archivoId, vozId, fichero), tipo, null);
    }

    @Override
    public Binario muestra(String vozId) {
        SecurityUtils.usuarioActual();
        ValidationUtils.vozId(vozId);
        return existente(almacen.muestra(vozId), MP3, null);
    }

    private void exigirDueno(UUID archivoId) {
        Long yo = SecurityUtils.usuarioActual();
        ValidationUtils.exigir(ejemplares.existsByUsuarioIdAndArchivo_Id(yo, archivoId),
                Message.Msj.archivoNoEncontrado, CodigoError.NO_ENCONTRADO);
    }

    private Binario existente(Path ruta, MediaType tipo, String nombre) {
        almacen.exigirDisponible();
        ValidationUtils.exigir(Files.isRegularFile(ruta), Message.Msj.archivoNoEncontrado, CodigoError.NO_ENCONTRADO);
        return new Binario(ruta, tipo, nombre);
    }

    static MediaType tipoDe(Formato f) {
        return switch (f) {
            case EPUB -> EPUB;
            case PDF -> MediaType.APPLICATION_PDF;
            case DOCX -> MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            case DOC -> MediaType.parseMediaType("application/msword");
            case TXT -> MediaType.parseMediaType("text/plain;charset=UTF-8");
        };
    }
}
