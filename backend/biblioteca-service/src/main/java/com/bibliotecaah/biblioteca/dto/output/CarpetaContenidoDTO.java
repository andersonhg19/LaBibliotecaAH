package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * (v1.6) Lo que se ve al abrir una carpeta del archivador (o la raiz).
 * Sin texto: sus subcarpetas y sus documentos. Con texto: lo que coincide en
 * ella y en todas sus subcarpetas, y en {@code ubicaciones} la ruta de cada
 * carpeta donde aparece algo ("Proyectos / 2026").
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarpetaContenidoDTO {
    /** La carpeta abierta; null = la raiz. */
    private CarpetaDTO carpeta;
    /** Migas de pan: de la primera carpeta bajo la raiz hasta la abierta (vacia en la raiz). */
    @Builder.Default
    private List<CarpetaDTO> ruta = new ArrayList<>();
    @Builder.Default
    private List<CarpetaDTO> subcarpetas = new ArrayList<>();
    @Builder.Default
    private List<EjemplarDTO> documentos = new ArrayList<>();
    /** Documentos de todo el archivador. */
    private long totalDocumentos;
    private boolean busqueda;
    /** true si hay mas documentos de los que caben en una respuesta (500; 200 en una busqueda). */
    private boolean recortado;
    @Builder.Default
    private Map<UUID, String> ubicaciones = new LinkedHashMap<>();
}
