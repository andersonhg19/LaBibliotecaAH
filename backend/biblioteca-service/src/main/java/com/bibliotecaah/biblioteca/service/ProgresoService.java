package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.ProgresoDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;

import java.util.UUID;

public interface ProgresoService {

    ProgresoDTO getById(UUID ejemplarId);

    /** Guarda si es mas reciente que lo guardado (gana el actualizadoEn mayor). */
    ResultDTO saveAndUpdate(ProgresoDTO dto);
}
