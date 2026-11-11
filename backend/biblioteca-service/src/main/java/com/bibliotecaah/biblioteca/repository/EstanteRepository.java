package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Estante;
import com.bibliotecaah.biblioteca.enums.TipoEstante;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EstanteRepository extends JpaRepository<Estante, UUID> {

    List<Estante> findByUsuarioIdOrderByOrdenAscNombreAsc(Long usuarioId);

    Optional<Estante> findByUsuarioIdAndTipo(Long usuarioId, TipoEstante tipo);

    Optional<Estante> findByIdAndUsuarioId(UUID id, Long usuarioId);

    Optional<Estante> findFirstByUsuarioIdAndNombreIgnoreCase(Long usuarioId, String nombre);
}
