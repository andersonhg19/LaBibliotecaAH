package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.EstanteEjemplarDTO;
import com.bibliotecaah.biblioteca.dto.input.EstanteSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.dto.output.EstanteDTO;

import java.util.List;
import java.util.UUID;

public interface EstanteService {

    List<EstanteDTO> getAll();

    EstanteDTO saveAndUpdate(EstanteSaveDTO dto);

    boolean delete(UUID estanteId);

    List<EjemplarDTO> libros(UUID estanteId);

    boolean agregar(UUID estanteId, UUID ejemplarId);

    boolean quitar(UUID estanteId, UUID ejemplarId);

    boolean ordenar(UUID estanteId, EstanteEjemplarDTO dto);

    /** Marca o desmarca un ejemplar del usuario como favorito. */
    void marcarFavorito(Long usuarioId, UUID ejemplarId, boolean favorito);
}
