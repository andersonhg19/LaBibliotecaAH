package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.output.CapituloDTO;
import com.bibliotecaah.biblioteca.entity.Ejemplar;

import java.util.List;
import java.util.UUID;

/**
 * (0.4.0, contrato C3) Que capitulos suenan en voz. Cada capitulo trae
 * enVozPorDefecto (de la estructura) y enVoz (la preferencia del usuario si la
 * dejo; si no, el defecto). Solo el dueno del ejemplar la ve y la cambia.
 */
public interface CapituloVozService {

    /** Capitulos del ejemplar con el enVoz efectivo de ese usuario (lista vacia sin estructura). */
    List<CapituloDTO> capitulos(Long usuarioId, Ejemplar ejemplar);

    /** Cambia (o con null devuelve al defecto) un capitulo del ejemplar del usuario actual. */
    CapituloDTO cambiar(UUID ejemplarId, int indice, Boolean enVoz);

    /** true: en voz solo la region "cuerpo"; false: borra las preferencias. Devuelve todos los capitulos. */
    List<CapituloDTO> soloHistoria(UUID ejemplarId, boolean soloHistoria);
}
