package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.LatidoDTO;
import com.bibliotecaah.biblioteca.dto.output.LatidoRespuestaDTO;
import com.bibliotecaah.biblioteca.dto.output.ResumenSesionesDTO;

import java.time.LocalDate;

/** (0.4.0, contrato C4) Sesiones de lectura y escucha: latidos y resumen con rachas. */
public interface SesionService {

    /** Crea o alarga la sesion del usuario actual en un ejemplar suyo. */
    LatidoRespuestaDTO latido(LatidoDTO latido);

    /** Minutos por dia, por libro y rachas entre dos fechas (por defecto, los ultimos 30 dias). */
    ResumenSesionesDTO resumen(LocalDate desde, LocalDate hasta);
}
