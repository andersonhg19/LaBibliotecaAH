package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Estante;
import com.bibliotecaah.biblioteca.enums.TipoEstante;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EstanteRepository extends JpaRepository<Estante, UUID> {

    List<Estante> findByUsuarioIdOrderByOrdenAscNombreAsc(Long usuarioId);

    Optional<Estante> findByUsuarioIdAndTipo(Long usuarioId, TipoEstante tipo);

    Optional<Estante> findByIdAndUsuarioId(UUID id, Long usuarioId);

    Optional<Estante> findFirstByUsuarioIdAndNombreIgnoreCase(Long usuarioId, String nombre);

    long countByUsuarioIdAndTipo(Long usuarioId, TipoEstante tipo);

    /** Crea Favoritos sin chocar si dos peticiones llegan a la vez (QA BI-09). */
    @Modifying
    @Query(value = "INSERT INTO bah_lib_estante (id, usuario_id, nombre, tipo, orden) "
            + "VALUES (:id, :usuarioId, :nombre, 'FAVORITOS', 0) ON CONFLICT DO NOTHING", nativeQuery = true)
    int crearFavoritosSiFalta(@Param("id") UUID id, @Param("usuarioId") Long usuarioId, @Param("nombre") String nombre);
}
