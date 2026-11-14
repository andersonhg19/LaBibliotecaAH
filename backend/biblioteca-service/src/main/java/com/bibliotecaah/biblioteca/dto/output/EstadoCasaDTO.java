package com.bibliotecaah.biblioteca.dto.output;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C6) GET /v1/estado-casa. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EstadoCasaDTO {
    /** OK | LENTO | CAIDO */
    private String taller;
    /** OK | CAIDO */
    private String traductor;
    /** OK | DESCONECTADO */
    private String disco;
    /** Trabajos de voz pendientes o en curso en toda la casa. */
    private int colaVoz;
    /** Explicacion para la persona, o null si todo va bien. */
    private String mensaje;
}
