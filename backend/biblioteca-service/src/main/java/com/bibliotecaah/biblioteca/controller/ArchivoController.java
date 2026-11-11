package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.service.ArchivoService;
import com.bibliotecaah.biblioteca.util.Mensajes;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * EXCEPCION DOCUMENTADA a "todo POST": los binarios se sirven por GET (y HEAD)
 * porque ni el {@code <audio>} ni el lector pueden mandar cabeceras; el token
 * llega como {@code ?t=} (ver JWTAuthorizationFilter).
 *
 * RANGE: devolver un Resource con 200 hace que Spring MVC atienda la cabecera
 * Range por si solo (206 + Content-Range con ResourceRegion, copiando en
 * streaming), y anuncie Accept-Ranges: bytes. Asi el reproductor salta dentro
 * del audio sin descargarlo entero.
 *
 * Aqui los errores SI llevan codigo HTTP (404, 503, 401): un {@code <audio>}
 * no lee un ResultDTO, pero si distingue un 503 de un 200.
 */
@RestController
@RequestMapping("/v1")
@Tag(name = "Archivos", description = "Binarios por GET con Range y ?t=")
public class ArchivoController {

    private final ArchivoService archivos;
    private final Mensajes mensajes;

    public ArchivoController(ArchivoService archivos, Mensajes mensajes) {
        this.archivos = archivos;
        this.mensajes = mensajes;
    }

    @Operation(summary = "EPUB normalizado (con ids por frase)")
    @RequestMapping(value = "/archivos/{archivoId}/libro.epub", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Resource> libro(@PathVariable UUID archivoId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rango) {
        return servir(archivos.libro(archivoId), rango);
    }

    @Operation(summary = "Portada (JPEG)")
    @RequestMapping(value = "/archivos/{archivoId}/portada.jpg", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Resource> portada(@PathVariable UUID archivoId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rango) {
        return servir(archivos.portada(archivoId), rango);
    }

    @Operation(summary = "Archivo original tal como se subio")
    @RequestMapping(value = "/archivos/{archivoId}/original", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Resource> original(@PathVariable UUID archivoId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rango) {
        return servir(archivos.original(archivoId), rango);
    }

    @Operation(summary = "Audio de un capitulo (cap-NNN.m4a, cap-NNN-2x.m4a) o sus tiempos (cap-NNN.tiempos.json)")
    @RequestMapping(value = "/archivos/{archivoId}/audio/{vozId}/{fichero}",
            method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Resource> audio(@PathVariable UUID archivoId, @PathVariable String vozId,
                                          @PathVariable String fichero,
                                          @RequestHeader(value = HttpHeaders.RANGE, required = false) String rango) {
        return servir(archivos.audio(archivoId, vozId, fichero), rango);
    }

    @Operation(summary = "Muestra de una voz (MP3)")
    @RequestMapping(value = "/voces/{vozId}/muestra.mp3", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Resource> muestra(@PathVariable String vozId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rango) {
        return servir(archivos.muestra(vozId), rango);
    }

    private static ResponseEntity<Resource> servir(ArchivoService.Binario b, String rango) {
        FileSystemResource recurso = new FileSystemResource(b.ruta());
        if (rango != null && !rangoSatisfacible(rango, recurso)) {
            // QA SE-16 c: un Range invalido o fuera del archivo da 416 SIN cuerpo y con
            // "Content-Range: bytes */<tamano>" (RFC 9110 15.5.17). Spring MVC ponia el 416 pero
            // mandaba el archivo entero detras.
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + tamano(recurso))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .build();
        }
        ResponseEntity.BodyBuilder r = ResponseEntity.ok()
                .contentType(b.tipo())
                .cacheControl(CacheControl.noCache().cachePrivate());
        if (b.nombreDescarga() != null) {
            r.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                    .filename(b.nombreDescarga(), StandardCharsets.UTF_8).build().toString());
        }
        return r.body(recurso);
    }

    /** Lo mismo que comprueba Spring MVC al servir el Range (sintaxis, orden, limites y numero de rangos). */
    static boolean rangoSatisfacible(String rango, Resource recurso) {
        try {
            HttpRange.toResourceRegions(HttpRange.parseRanges(rango), recurso);
            return true;
        } catch (IllegalArgumentException invalido) {
            return false;
        }
    }

    private static long tamano(Resource recurso) {
        try {
            return recurso.contentLength();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ResultDTO> error(ValidationException ex) {
        HttpStatus estado = switch (ex.getCodigo()) {
            case 401 -> HttpStatus.UNAUTHORIZED;
            case 503 -> HttpStatus.SERVICE_UNAVAILABLE;
            case 102 -> HttpStatus.NOT_FOUND;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(estado).contentType(MediaType.APPLICATION_JSON)
                .body(new ResultDTO(false, mensajes.texto(ex.getClave(), ex.getArgumentos()), ex.getCodigo()));
    }
}
