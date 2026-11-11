package com.bibliotecaah.biblioteca.repository;

import java.util.Optional;

/**
 * Cache de traducciones de textos sueltos (bah_lib_traduccion, V3). SQL directo: es una cache
 * clave-valor, no una entidad del dominio, y la insercion debe tolerar dos peticiones iguales
 * a la vez (ON CONFLICT DO NOTHING).
 */
public interface TraduccionRepository {

    /** Traduccion y origen detectado guardados. */
    record Guardada(String traduccion, String origenDetectado) { }

    /** Busca por hash y, si esta, marca que se acaba de usar. */
    Optional<Guardada> buscar(String hash);

    void guardar(String hash, String origen, String destino, String traduccion, String origenDetectado);

    /** Borra las que llevan mas de {@code dias} sin usarse. @return cuantas borro */
    int purgar(int dias);
}
