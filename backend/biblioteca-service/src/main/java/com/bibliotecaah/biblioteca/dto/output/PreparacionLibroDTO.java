package com.bibliotecaah.biblioteca.dto.output;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C5) Progreso de "preparar el libro entero" en una voz (solo capitulos con enVoz=true). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PreparacionLibroDTO {
    private int total;
    private int listos;
    private int enCola;
    private int error;
    /** Solo en el POST: cuantos capitulos se encolaron con esta peticion (0 si ya estaba todo). */
    private Integer encolados;
}
