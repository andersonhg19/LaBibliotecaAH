package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;
import com.bibliotecaah.biblioteca.dto.output.PronunciacionDTO;

import java.util.List;
import java.util.UUID;

/**
 * (B17) Diccionario de pronunciacion de un libro ("Hermione" -> "Jermayoni").
 * Es del ARCHIVO (el audio se comparte por archivo y voz); lo ve y lo cambia el
 * dueno de un ejemplar con ese archivo (102 si no). Al cambiarlo se regeneran
 * los capitulos ya LISTO que contienen alguna palabra cambiada, sin borrar el
 * audio viejo hasta que el nuevo este LISTO.
 */
public interface PronunciacionService {

    int MAX_ENTRADAS = 200;
    int MAX_DE = 80;
    int MAX_A = 120;

    PronunciacionDTO ver(UUID ejemplarId);

    /** Sustituye el diccionario entero por esta lista (vacia = borrarlo). */
    PronunciacionDTO guardar(UUID ejemplarId, List<PronunciacionEntradaDTO> entradas);
}
