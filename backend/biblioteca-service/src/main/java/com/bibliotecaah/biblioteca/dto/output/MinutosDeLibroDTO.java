package com.bibliotecaah.biblioteca.dto.output;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C4) Minutos dedicados a un libro en el periodo. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MinutosDeLibroDTO {
    private UUID ejemplarId;
    /** Titulo de la obra (aditivo, para no tener que buscarlo). */
    private String titulo;
    private int minutos;
}
