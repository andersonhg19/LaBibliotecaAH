package com.bibliotecaah.biblioteca.dto.input;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * (B17) Una entrada del diccionario de pronunciacion de un libro: la palabra
 * tal como esta en el texto ({@code de}) y como debe decirla la voz ({@code a}).
 * Se valida en el servicio (mensajes con la posicion de la entrada).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PronunciacionEntradaDTO {
    private String de;
    private String a;
}
