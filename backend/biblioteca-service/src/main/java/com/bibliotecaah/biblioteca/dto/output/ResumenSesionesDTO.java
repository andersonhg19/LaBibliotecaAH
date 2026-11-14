package com.bibliotecaah.biblioteca.dto.output;

import java.time.LocalDate;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C4) GET /v1/sesiones/resumen. Rachas en dias seguidos con al menos 1 minuto (zona America/Bogota). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResumenSesionesDTO {
    private LocalDate desde;
    private LocalDate hasta;
    private int minutosLectura;
    private int minutosVoz;
    /** Todos los dias del periodo, tambien los de 0 minutos, en orden. */
    private List<DiaDeLecturaDTO> dias;
    /** Dias seguidos hasta hoy (o hasta ayer si hoy aun no se ha leido). */
    private int rachaActual;
    /** La racha mas larga de toda la historia. */
    private int rachaMaxima;
    /** De mas a menos minutos. */
    private List<MinutosDeLibroDTO> libros;
}
