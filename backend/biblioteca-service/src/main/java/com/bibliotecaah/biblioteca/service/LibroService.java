package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.input.DeseoDTO;
import com.bibliotecaah.biblioteca.dto.input.LibroSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDetalleDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;
import com.bibliotecaah.biblioteca.dto.output.PageDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/** "Mi Biblioteca": todo filtrado por el usuario del token. */
public interface LibroService {

    /**
     * @param deseoId opcional (QA BI-15, "Ya lo tengo"): un deseo del usuario que este archivo cumple. Con el,
     *                se admite un solo archivo; el ejemplar que llegue hereda la nota, las etiquetas y los
     *                estantes del deseo, y el deseo se borra.
     */
    ResultDTO subir(List<MultipartFile> archivos, TipoEjemplar tipo, UUID deseoId);

    EjemplarDTO deseo(DeseoDTO dto);

    PageDTO<EjemplarDTO> getAll(FiltroLibrosDTO filtro);

    EjemplarDetalleDTO getById(UUID ejemplarId);

    EjemplarDTO saveAndUpdate(LibroSaveDTO dto);

    boolean delete(UUID ejemplarId);

    /** Facetas de una pestana (null = TODO, solo libros). */
    FacetasDTO facetas(FiltroLibrosDTO.Pestana pestana);
}
