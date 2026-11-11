package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;

import java.io.IOException;
import java.io.InputStream;

/** Entrada de un fichero a la biblioteca de un usuario (subida web o buzon). */
public interface IngestaService {

    /** Resultado de un fichero: o un ejemplar, o el motivo (ya en espanol) del rechazo. */
    record Resultado(EjemplarDTO ejemplar, String rechazo) {
        public boolean aceptado() {
            return ejemplar != null;
        }
    }

    Resultado ingerir(Long usuarioId, String nombreOriginal, InputStream contenido, TipoEjemplar tipo)
            throws IOException;
}
