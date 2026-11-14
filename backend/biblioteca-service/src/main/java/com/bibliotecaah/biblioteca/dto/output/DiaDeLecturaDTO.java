package com.bibliotecaah.biblioteca.dto.output;

import java.time.LocalDate;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C4) Minutos de un dia (lectura + voz) en la zona de la casa. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiaDeLecturaDTO {
    private LocalDate fecha;
    private int minutos;
}
