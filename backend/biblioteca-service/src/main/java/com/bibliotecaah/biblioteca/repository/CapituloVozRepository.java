package com.bibliotecaah.biblioteca.repository;

import java.util.Map;
import java.util.UUID;

/**
 * (0.4.0, contrato C3) Preferencias de voz por capitulo: bah_lib_capitulo_voz.
 * Solo se guarda lo que el usuario cambio; sin fila manda la estructura.
 */
public interface CapituloVozRepository {

    /** indice -> enVoz de lo que ese usuario cambio en ese ejemplar. */
    Map<Integer, Boolean> deEjemplar(Long usuarioId, UUID ejemplarId);

    /** Guarda (o, con null, borra) la preferencia de un capitulo. */
    void guardar(Long usuarioId, UUID ejemplarId, int indice, Boolean enVoz);

    /** Sustituye TODAS las preferencias del ejemplar por estas (vacio = volver al defecto). */
    void reemplazar(Long usuarioId, UUID ejemplarId, Map<Integer, Boolean> preferencias);
}
