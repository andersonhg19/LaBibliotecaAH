package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un capitulo de la ficha (contratos §9 y, desde 0.4.0, C3). Los campos de la
 * estructura v2 (tipo, region, numero, minutosVoz) llegan null en los libros
 * convertidos antes y aun sin reclasificar: la web numera como siempre.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CapituloDTO {
    private int indice;
    private String titulo;
    /** ceil(palabras / 150), como siempre. */
    private int minutos;
    /** capitulo | parte | prologo | ... (estructura v2) o null. */
    private String tipo;
    /** antes | cuerpo | despues (estructura v2) o null. */
    private String region;
    /** Numero visible calculado por el taller; null = sin numero (o libro v1). */
    private Integer numero;
    /** Lo que vale de verdad: la preferencia del usuario si la hay; si no, enVozPorDefecto. */
    @Builder.Default
    private boolean enVoz = true;
    /** estructura.enVoz, o true si el libro es v1. */
    @Builder.Default
    private boolean enVozPorDefecto = true;
    /** ceil(palabrasVoz / 150) si la estructura lo trae; si no, null. */
    private Integer minutosVoz;

    /** Capitulo de un libro v1 (sin clasificar): en voz por defecto. */
    public CapituloDTO(int indice, String titulo, int minutos) {
        this(indice, titulo, minutos, null, null, null, true, true, null);
    }
}
