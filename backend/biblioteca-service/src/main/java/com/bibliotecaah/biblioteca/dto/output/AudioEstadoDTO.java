package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AudioEstadoDTO {
    /** PENDIENTE | GENERANDO | LISTO | ERROR */
    private String estado;
    private Double duracionSeg;
    private String url1x;
    private String url2x;
    private String urlTiempos;
    /** Con estado ERROR: el motivo que dejo el taller (QA DA-02). null en los demas. */
    private String error;
}
