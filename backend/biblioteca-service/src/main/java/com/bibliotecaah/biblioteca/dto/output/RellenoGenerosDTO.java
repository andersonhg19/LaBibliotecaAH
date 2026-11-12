package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Respuesta de POST /v1/admin/libros/rellenar-generos (v1.4). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RellenoGenerosDTO {
    /** Archivos que el taller va a releer ahora (0 si ya estaba todo leido o en cola). */
    private int archivosEncolados;
    /** Obras con archivo y sin ningun genero en el momento de pedirlo. */
    private int obrasSinGenero;
}
