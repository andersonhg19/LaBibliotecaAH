package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.filter.FiltroCarpetaDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaBorrarDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaMoverDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaSaveDTO;
import com.bibliotecaah.biblioteca.dto.input.MoverDocumentosDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaBorradaDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaContenidoDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaDTO;

import java.util.List;
import java.util.UUID;

/** (v1.6) Carpetas y subcarpetas del archivador de documentos del usuario. */
public interface CarpetaService {

    /** Todas las carpetas del usuario con sus cuentas (para elegir destino al mover). */
    List<CarpetaDTO> getAll();

    /** Lo que hay en una carpeta (o en la raiz), o lo que coincide con un texto dentro de ella. */
    CarpetaContenidoDTO contenido(FiltroCarpetaDTO filtro);

    /** Crea (sin id) o renombra (con id). */
    CarpetaDTO saveAndUpdate(CarpetaSaveDTO dto);

    /** Cambia una carpeta de sitio (con todo lo suyo). */
    CarpetaDTO mover(CarpetaMoverDTO dto);

    /** Pone uno o varios documentos en una carpeta (o en la raiz). Devuelve cuantos se movieron. */
    int moverDocumentos(MoverDocumentosDTO dto);

    /** Borra la carpeta; con algo dentro hay que decir que pasa con ello. */
    CarpetaBorradaDTO delete(UUID carpetaId, CarpetaBorrarDTO dto);
}
