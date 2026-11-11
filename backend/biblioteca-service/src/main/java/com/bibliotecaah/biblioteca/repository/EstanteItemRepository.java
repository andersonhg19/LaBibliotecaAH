package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.EstanteItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EstanteItemRepository extends JpaRepository<EstanteItem, EstanteItem.Clave> {

    List<EstanteItem> findByEstanteIdOrderByOrdenAsc(UUID estanteId);

    Optional<EstanteItem> findByEstanteIdAndEjemplarId(UUID estanteId, UUID ejemplarId);

    List<EstanteItem> findByEstanteIdAndEjemplarIdIn(UUID estanteId, Collection<UUID> ejemplarIds);

    /** Libros visibles del estante (sin los retirados, QA BI-01). */
    @Query("SELECT COUNT(i) FROM EstanteItem i, Ejemplar e WHERE e.id = i.ejemplarId "
            + "AND i.estanteId = :estanteId AND e.retiradoEn IS NULL")
    long contarVisibles(@Param("estanteId") UUID estanteId);

    /**
     * Agrega sin chocar (QA BI-09): dos toques seguidos en "favorito" o en una
     * coleccion insertaban dos veces y el segundo daba "error inesperado".
     * Devuelve 1 si entro, 0 si ya estaba.
     */
    @Modifying
    @Query(value = "INSERT INTO bah_lib_estante_item (estante_id, ejemplar_id, orden, id_modified_by) "
            + "VALUES (:estanteId, :ejemplarId, COALESCE((SELECT FLOOR(MAX(orden)) + 1 FROM bah_lib_estante_item "
            + "WHERE estante_id = :estanteId), 1), :quien) ON CONFLICT DO NOTHING", nativeQuery = true)
    int agregarSiFalta(@Param("estanteId") UUID estanteId, @Param("ejemplarId") UUID ejemplarId,
                       @Param("quien") Long quien);

    /** Quita sin chocar: si otra peticion ya lo quito, no pasa nada (QA BI-09). */
    @Modifying
    @Query("DELETE FROM EstanteItem i WHERE i.estanteId = :estanteId AND i.ejemplarId = :ejemplarId")
    int quitar(@Param("estanteId") UUID estanteId, @Param("ejemplarId") UUID ejemplarId);

    @Query("SELECT i.ejemplarId FROM EstanteItem i, Estante s WHERE s.id = i.estanteId "
            + "AND s.usuarioId = :usuarioId AND s.tipo = com.bibliotecaah.biblioteca.enums.TipoEstante.FAVORITOS "
            + "AND i.ejemplarId IN :ids")
    List<UUID> favoritosEntre(@Param("usuarioId") Long usuarioId, @Param("ids") Collection<UUID> ids);

    /**
     * QA BI-15: el ejemplar que cumple un deseo entra en los mismos estantes y en la misma posicion que el
     * deseo (si ya estaba en alguno, se queda donde estaba). Devuelve cuantos estantes heredo.
     */
    @Modifying
    @Query(value = "INSERT INTO bah_lib_estante_item (estante_id, ejemplar_id, orden, id_modified_by) "
            + "SELECT estante_id, :nuevo, orden, :quien FROM bah_lib_estante_item WHERE ejemplar_id = :deseo "
            + "ON CONFLICT DO NOTHING", nativeQuery = true)
    int heredarEstantes(@Param("deseo") UUID deseo, @Param("nuevo") UUID nuevo, @Param("quien") Long quien);

    @Query("SELECT MAX(i.orden) FROM EstanteItem i WHERE i.estanteId = :estanteId")
    Double maximoOrden(@Param("estanteId") UUID estanteId);
}
