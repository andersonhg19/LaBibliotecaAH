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

    Binario muestra(String vozId);
}
