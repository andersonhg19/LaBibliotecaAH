package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Progreso;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProgresoRepository extends JpaRepository<Progreso, UUID> {

    Optional<Progreso> findByUsuarioIdAndEjemplarId(Long usuarioId, UUID ejemplarId);

    List<Progreso> findByUsuarioIdAndEjemplarIdIn(Long usuarioId, Collection<UUID> ejemplarIds);
}
