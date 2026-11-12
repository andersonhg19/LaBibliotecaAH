package com.bibliotecaah.biblioteca.dto.input;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * (v1.6) Que hacer con lo que hay dentro de la carpeta que se borra. Una carpeta
 * vacia se borra sin elegir; con algo dentro hay que elegir (si no, 120).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarpetaBorrarDTO {

    public enum Contenido {
        /** Documentos y subcarpetas pasan a la carpeta de arriba (la raiz si era de primer nivel). */
        SUBIR,
        /** Se borran las subcarpetas y se retiran los documentos (como "Retirar": lo escrito se conserva). */
        BORRAR
    }

    private Contenido contenido;
}
