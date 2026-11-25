package com.bibliotecaah.biblioteca.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** (0.5.0, C9) Diario del reproductor: bah_lib_diario (V8). */
public interface DiarioRepository {

    /** Un evento ya validado y con el usuario del token; {@code contextoJson} es el objeto plano serializado o null. */
    record Evento(Long usuarioId, UUID ejemplarId, Instant cuando, String tipo, Integer capitulo, Double posicion,
                  String detalle, String contextoJson) { }

    /** Inserta los eventos en un solo lote. */
    void guardar(List<Evento> eventos);

    /** De los ids dados, los que son ejemplares de ese usuario (los demas se guardan como null). */
    Set<UUID> ejemplaresDelUsuario(Long usuarioId, Collection<UUID> ids);

    /** Borra lo creado hace mas de {@code dias} dias. Devuelve cuantas filas borro. */
    int purgar(int dias);
}
