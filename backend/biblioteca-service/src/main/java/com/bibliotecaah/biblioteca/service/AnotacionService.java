package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.AnotacionDTO;

import java.util.List;
import java.util.UUID;

public interface AnotacionService {

    List<AnotacionDTO> getAll(UUID ejemplarId);

    AnotacionDTO saveAndUpdate(AnotacionDTO dto);

    boolean delete(UUID id);
}
