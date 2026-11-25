package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.5.0, C9) Respuesta de POST /v1/diario: cuantos eventos se guardaron de verdad (el tope por hora descarta el resto). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class DiarioGuardadoDTO {
    private int guardados;
}
