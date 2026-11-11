package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;

import java.util.List;
import java.util.UUID;

/** Consultas de "Mi Biblioteca" que no caben en JPQL (filtros combinables y facetas). */
public interface EjemplarCustomRepository {

    record Pagina(List<UUID> ids, long total) { }

    Pagina buscar(Long usuarioId, FiltroLibrosDTO filtro, int page, int size);

    FacetasDTO facetas(Long usuarioId, FiltroLibrosDTO.Pestana pestana);
}
