package com.bibliotecaah.biblioteca.dto.input;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C3) PUT /v1/ejemplares/{id}/capitulos/{indice}/voz: true | false | null (= volver al defecto). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CapituloVozDTO {
    private Boolean enVoz;
}
