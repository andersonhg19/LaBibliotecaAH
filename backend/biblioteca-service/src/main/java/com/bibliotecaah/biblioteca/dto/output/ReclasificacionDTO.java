package com.bibliotecaah.biblioteca.dto.output;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C2) Respuesta de POST /v1/admin/libros/reclasificar-estructura. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReclasificacionDTO {
    /** Archivos encolados ahora para reclasificar. */
    private int archivosEncolados;
    /** Archivos cuya estructura ya es v2 (no se tocan). */
    private int yaReclasificados;
    /** Archivos que ya tenian un trabajo vivo (no se duplica). */
    private int yaEnCola;
    /** Archivos LISTO sin estructura.json (hojas de calculo o disco fuera). */
    private int sinEstructura;
}
