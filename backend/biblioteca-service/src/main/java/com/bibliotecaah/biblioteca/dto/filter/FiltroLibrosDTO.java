package com.bibliotecaah.biblioteca.dto.filter;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/** contratos.md §9: FiltroLibrosDTO. Todo opcional. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FiltroLibrosDTO {

    public enum Pestana { TODO, LEYENDO, POR_LEER, LEIDOS, FAVORITOS, DESEOS, DOCUMENTOS }

    public enum Orden { RECIENTES, ANTIGUOS, ULTIMO_ABIERTO, TITULO, AUTOR, ANIO, PROGRESO, CALIFICACION }

    private Pestana pestana;
    /** Auditoria BK-06: como el texto de busqueda de carpetas, 200 como mucho (120 con el campo). */
    @Size(max = 200, message = "{validacion.maximo}")
    private String texto;
    private List<String> autores;
    private List<String> generos;
    private List<String> formatos;
    private List<String> etiquetas;
    private Integer anioDesde;
    private Integer anioHasta;
    private Double calificacionMin;
    private Boolean conNotas;
    private Orden orden;
    private Integer page;
    private Integer size;
}
