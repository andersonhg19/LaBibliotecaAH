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
    /**
     * (v1.5) Con estado PENDIENTE o GENERANDO, si el taller ya escribio partes
     * reproducibles: la URL de cap-NNN.partes.json (contratos §6 bis). La web
     * puede empezar a sonar con ellas sin esperar al capitulo entero. null si no.
     */
    private String urlPartes;
}
