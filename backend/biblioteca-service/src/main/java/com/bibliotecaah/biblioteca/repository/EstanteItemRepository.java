package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.EstanteItem;
import org.springframework.data.jpa.repository.JpaRepository;
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

    long countByEstanteId(UUID estanteId);

    @Query("SELECT i.ejemplarId FROM EstanteItem i, Estante s WHERE s.id = i.estanteId "
            + "AND s.usuarioId = :usuarioId AND s.tipo = com.bibliotecaah.biblioteca.enums.TipoEstante.FAVORITOS "
            + "AND i.ejemplarId IN :ids")
    List<UUID> favoritosEntre(@Param("usuarioId") Long usuarioId, @Param("ids") Collection<UUID> ids);

    @Query("SELECT MAX(i.orden) FROM EstanteItem i WHERE i.estanteId = :estanteId")
    Double maximoOrden(@Param("estanteId") UUID estanteId);
}
