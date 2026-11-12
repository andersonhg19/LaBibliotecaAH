package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (v1.6) Lo que paso al borrar una carpeta. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CarpetaBorradaDTO {
    private int documentosMovidos;
    private int carpetasMovidas;
    private int documentosRetirados;
    private int carpetasBorradas;
}
