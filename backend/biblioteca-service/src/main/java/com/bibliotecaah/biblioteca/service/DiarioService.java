package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.DiarioDTO;
import com.bibliotecaah.biblioteca.dto.output.DiarioGuardadoDTO;

/** (0.5.0, C9) Diario del reproductor: telemetria propia que nunca sale de casa. */
public interface DiarioService {

    /** Guarda los eventos del usuario actual (como mucho los que quepan en su tope por hora). */
    DiarioGuardadoDTO guardar(DiarioDTO lote);
}
