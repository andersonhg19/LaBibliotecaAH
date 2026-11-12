package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Carpeta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** (v1.6) Carpetas del archivador. Toda consulta va filtrada por el usuario. */
public interface CarpetaRepository extends JpaRepository<Carpeta, UUID> {

    List<Carpeta> findByUsuarioId(Long usuarioId);

    Optional<Carpeta> findByIdAndUsuarioId(UUID id, Long usuarioId);

    long countByUsuarioId(Long usuarioId);

    /** Cambia de padre una carpeta (null = raiz). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Carpeta c SET c.padreId = :destino, c.idModifiedBy = :usuarioId, c.lastUpdate = CURRENT_TIMESTAMP "
            + "WHERE c.usuarioId = :usuarioId AND c.id = :id")
    int moverA(@Param("usuarioId") Long usuarioId, @Param("id") UUID id, @Param("destino") UUID destino);
}
