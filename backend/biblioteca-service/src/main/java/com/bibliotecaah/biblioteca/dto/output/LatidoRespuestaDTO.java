package com.bibliotecaah.biblioteca.dto.output;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C4) Respuesta del latido. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LatidoRespuestaDTO {
    private UUID sesionId;
    private int segundosTotales;
}
