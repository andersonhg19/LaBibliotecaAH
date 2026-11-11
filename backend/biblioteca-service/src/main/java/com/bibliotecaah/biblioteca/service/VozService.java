package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.output.VozDTO;

import java.util.List;

public interface VozService {

    /** Catalogo del taller (con cache) o, si no responde, el catalogo inicial. */
    List<VozDTO> getAll();
}
