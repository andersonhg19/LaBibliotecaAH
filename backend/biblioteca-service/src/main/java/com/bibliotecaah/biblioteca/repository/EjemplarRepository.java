package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EjemplarRepository extends JpaRepository<Ejemplar, UUID>, EjemplarCustomRepository {

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo "
            + "WHERE e.id = :id AND e.usuarioId = :usuarioId")
    Optional<Ejemplar> delUsuario(@Param("id") UUID id, @Param("usuarioId") Long usuarioId);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo WHERE e.id IN :ids")
    List<Ejemplar> conObraYArchivo(@Param("ids") Collection<UUID> ids);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo "
            + "WHERE e.usuarioId = :usuarioId AND e.archivo.id = :archivoId")
    Optional<Ejemplar> delUsuarioPorArchivo(@Param("usuarioId") Long usuarioId, @Param("archivoId") UUID archivoId);

    boolean existsByUsuarioIdAndArchivo_Id(Long usuarioId, UUID archivoId);

    long countByArchivo_Id(UUID archivoId);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra o "
            + "WHERE e.archivo.id = :archivoId AND o.fuenteMetadatos = :fuente")
    List<Ejemplar> conObraProvisional(@Param("archivoId") UUID archivoId, @Param("fuente") FuenteMetadatos fuente);
}
