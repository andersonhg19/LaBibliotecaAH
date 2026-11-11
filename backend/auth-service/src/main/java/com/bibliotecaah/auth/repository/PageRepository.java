package com.bibliotecaah.auth.repository;

import com.bibliotecaah.auth.entity.Page;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PageRepository extends JpaRepository<Page, Long> {

    /**
     * Todas las paginas con su modulo ya cargado. La relacion es perezosa y
     * aqui se recorren todas, asi que sin el FETCH esto es una consulta por
     * pagina.
     */
    @Query("SELECT p FROM Page p JOIN FETCH p.module m WHERE p.active = true AND m.active = true "
            + "ORDER BY m.sortOrder ASC, p.sortOrder ASC")
    List<Page> findAllActivasConModulo();

    Optional<Page> findByModuleCodeAndCode(String moduleCode, String code);

    List<Page> findAllByModuleIdOrderBySortOrderAsc(Long moduleId);
}
