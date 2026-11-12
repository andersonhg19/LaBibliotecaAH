package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.output.RellenoGenerosDTO;

/** Tareas de mantenimiento de la instalacion (rol ADMIN). */
public interface MantenimientoService {

    /**
     * Relleno de generos de los libros que llegaron antes de leer las materias
     * (v1.4): pide al taller que relea SOLO las materias de sus originales. No
     * reconvierte nada ni toca titulos, autores o portadas; solo rellena los
     * generos de las obras que no tienen ninguno. Idempotente.
     */
    RellenoGenerosDTO rellenarGeneros();
}
