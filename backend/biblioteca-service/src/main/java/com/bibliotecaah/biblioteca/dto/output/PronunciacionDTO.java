package com.bibliotecaah.biblioteca.dto.output;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * (B17) Diccionario de pronunciacion del libro (del ARCHIVO: lo comparten todos
 * los ejemplares de ese archivo, como el audio), ordenado por palabra, y cuantos
 * capitulos se estan regenerando con el (trabajos de voz vivos con "regenerar").
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PronunciacionDTO {
    private List<PronunciacionEntradaDTO> entradas;
    private int regenerando;
}
