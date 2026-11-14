package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotNull;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C3) PUT /v1/ejemplares/{id}/capitulos/voz: true = solo el cuerpo en voz; false = borrar preferencias. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SoloHistoriaDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private Boolean soloHistoria;
}
