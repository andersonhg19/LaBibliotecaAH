package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;

import java.util.List;
import java.util.UUID;

/**
 * (B17) Diccionario de pronunciacion por archivo: bah_lib_pronunciacion (V7).
 * El payload de VOZ_CAPITULO lo lee directamente en SQL (TrabajoRepositoryImpl).
 */
public interface PronunciacionRepository {

    /** Entradas del archivo ordenadas por palabra (sin distinguir mayusculas). */
    List<PronunciacionEntradaDTO> deArchivo(UUID archivoId);

    /** Sustituye TODO el diccionario del archivo por estas entradas (vacio = borrarlo). */
    void reemplazar(UUID archivoId, List<PronunciacionEntradaDTO> entradas, Long usuarioId);
}
