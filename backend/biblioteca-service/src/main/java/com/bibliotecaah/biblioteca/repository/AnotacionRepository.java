package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Anotacion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AnotacionRepository extends JpaRepository<Anotacion, UUID> {

    List<Anotacion> findByUsuarioIdAndEjemplarIdOrderByCreationAsc(Long usuarioId, UUID ejemplarId);

    Optional<Anotacion> findByIdAndUsuarioId(UUID id, Long usuarioId);

    @Query("SELECT a.ejemplarId, COUNT(a) FROM Anotacion a "
            + "WHERE a.usuarioId = :usuarioId AND a.ejemplarId IN :ids GROUP BY a.ejemplarId")
    List<Object[]> contarPorEjemplar(@Param("usuarioId") Long usuarioId, @Param("ids") Collection<UUID> ids);
}
