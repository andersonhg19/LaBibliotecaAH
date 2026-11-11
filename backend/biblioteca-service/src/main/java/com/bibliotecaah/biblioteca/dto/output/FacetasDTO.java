package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FacetasDTO {
    private List<FacetaDTO> autores;
    private List<FacetaDTO> generos;
    private List<FacetaDTO> anios;
    private List<FacetaDTO> formatos;
    private List<FacetaDTO> etiquetas;
}
