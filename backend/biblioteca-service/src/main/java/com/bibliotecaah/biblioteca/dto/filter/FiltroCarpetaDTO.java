package com.bibliotecaah.biblioteca.dto.filter;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** (v1.6) Que carpeta abrir (null = raiz), busqueda dentro (con subcarpetas) y orden. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FiltroCarpetaDTO {

    public enum Orden { NOMBRE, RECIENTES, ANTIGUOS }

    private UUID carpetaId;
    @Size(max = 200, message = "{validacion.maximo}")
    private String texto;
    private Orden orden;
}
