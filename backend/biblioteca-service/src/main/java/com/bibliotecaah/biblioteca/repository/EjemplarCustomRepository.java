package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.filter.FiltroCarpetaDTO;
import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Consultas de "Mi Biblioteca" que no caben en JPQL (filtros combinables, facetas y carpetas). */
public interface EjemplarCustomRepository {

    record Pagina(List<UUID> ids, long total) { }

    Pagina buscar(Long usuarioId, FiltroLibrosDTO filtro, int page, int size);

    FacetasDTO facetas(Long usuarioId, FiltroLibrosDTO.Pestana pestana);

    /** (v1.6) Documentos visibles de una carpeta (null = los de la raiz), en orden; como mucho {@code limite}. */
    List<UUID> documentosDeCarpeta(Long usuarioId, UUID carpetaId, FiltroCarpetaDTO.Orden orden, int limite);

    /**
     * (v1.6) Documentos visibles que coinciden con el texto (sin mayusculas ni tildes) dentro de esas
     * carpetas; {@code carpetas} null = en todo el archivador (raiz incluida).
     */
    List<UUID> buscarDocumentos(Long usuarioId, Collection<UUID> carpetas, String texto, FiltroCarpetaDTO.Orden orden,
                                int limite);

    /** (v1.6) Documentos visibles por carpeta; la clave null es la raiz. */
    Map<UUID, Long> documentosPorCarpeta(Long usuarioId);

    /** (v1.6) Ids de los documentos visibles que estan en esas carpetas. */
    List<UUID> documentosEn(Long usuarioId, Collection<UUID> carpetas);

    /** (v1.6) Pone esos documentos (solo los del usuario, visibles y de tipo DOCUMENTO) en la carpeta. */
    int moverDocumentos(Long usuarioId, Collection<UUID> ejemplarIds, UUID carpetaId);
}
