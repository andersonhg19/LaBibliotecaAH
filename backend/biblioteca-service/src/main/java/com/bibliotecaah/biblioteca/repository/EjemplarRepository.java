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

/**
 * Los ejemplares RETIRADOS (QA BI-01, retirado_en no nulo) no existen para
 * ninguna consulta de aqui salvo {@link #retiradoPorSha256}: un retirado no se
 * lee, no se edita y no se sirve. Ademas no tienen archivo, asi que las
 * consultas por archivo ya los excluyen solas.
 */
public interface EjemplarRepository extends JpaRepository<Ejemplar, UUID>, EjemplarCustomRepository {

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo "
            + "WHERE e.id = :id AND e.usuarioId = :usuarioId AND e.retiradoEn IS NULL")
    Optional<Ejemplar> delUsuario(@Param("id") UUID id, @Param("usuarioId") Long usuarioId);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo "
            + "WHERE e.id IN :ids AND e.retiradoEn IS NULL")
    List<Ejemplar> conObraYArchivo(@Param("ids") Collection<UUID> ids);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra LEFT JOIN FETCH e.archivo "
            + "WHERE e.usuarioId = :usuarioId AND e.archivo.id = :archivoId")
    Optional<Ejemplar> delUsuarioPorArchivo(@Param("usuarioId") Long usuarioId, @Param("archivoId") UUID archivoId);

    /** El retirado mas reciente de ese usuario con ese fichero (para que reaparezca al subirlo). */
    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra WHERE e.usuarioId = :usuarioId "
            + "AND e.archivoSha256 = :sha256 AND e.retiradoEn IS NOT NULL ORDER BY e.retiradoEn DESC")
    List<Ejemplar> retiradoPorSha256(@Param("usuarioId") Long usuarioId, @Param("sha256") String sha256);

    boolean existsByUsuarioIdAndArchivo_Id(Long usuarioId, UUID archivoId);

    long countByArchivo_Id(UUID archivoId);

    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra o "
            + "WHERE e.archivo.id = :archivoId AND o.fuenteMetadatos = :fuente")
    List<Ejemplar> conObraProvisional(@Param("archivoId") UUID archivoId, @Param("fuente") FuenteMetadatos fuente);

    /** Los ejemplares (de cualquier usuario) que leen ese archivo, con su obra. */
    @Query("SELECT e FROM Ejemplar e JOIN FETCH e.obra WHERE e.archivo.id = :archivoId")
    List<Ejemplar> porArchivo(@Param("archivoId") UUID archivoId);
}
