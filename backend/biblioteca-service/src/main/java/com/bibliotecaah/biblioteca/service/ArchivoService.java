package com.bibliotecaah.biblioteca.service;

import org.springframework.http.MediaType;

import java.nio.file.Path;
import java.util.UUID;

/** Que fichero servir y con que tipo; siempre comprobando que el usuario es dueno. */
public interface ArchivoService {

    record Binario(Path ruta, MediaType tipo, String nombreDescarga) { }

    Binario libro(UUID archivoId);

    Binario portada(UUID archivoId);

    Binario original(UUID archivoId);

    Binario audio(UUID archivoId, String vozId, String fichero);

    /** (v1.5) normalizados/{archivoId}/frases/cap-NNN.json: el texto del capitulo por frases (contratos §5). */
    Binario frases(UUID archivoId, String fichero);

    /** (v1.6) normalizados/{archivoId}/hoja.json: la hoja de calculo para el visor (contratos §11). */
    Binario hoja(UUID archivoId);

    Binario muestra(String vozId);
}
