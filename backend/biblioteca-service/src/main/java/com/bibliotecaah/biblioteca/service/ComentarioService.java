package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.ComentarioDTO;

import java.util.List;
import java.util.UUID;

public interface ComentarioService {

    List<ComentarioDTO> getAll(UUID ejemplarId);

    ComentarioDTO saveAndUpdate(ComentarioDTO dto);

    boolean delete(UUID id);
}
