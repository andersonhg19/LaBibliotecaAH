package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Comentario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ComentarioRepository extends JpaRepository<Comentario, UUID> {

    List<Comentario> findByUsuarioIdAndEjemplarIdOrderByCreationAsc(Long usuarioId, UUID ejemplarId);

    Optional<Comentario> findByIdAndUsuarioId(UUID id, Long usuarioId);

    /** El mismo texto en el mismo libro hace un momento (doble envio, QA BI-10). */
    Optional<Comentario> findFirstByUsuarioIdAndEjemplarIdAndTextoAndCreationAfterOrderByCreationDesc(
            Long usuarioId, UUID ejemplarId, String texto, java.time.Instant desde);
}
