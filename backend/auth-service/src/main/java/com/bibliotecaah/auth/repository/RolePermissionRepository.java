package com.bibliotecaah.auth.repository;

import com.bibliotecaah.auth.entity.RolePermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RolePermissionRepository extends JpaRepository<RolePermission, Long> {

    /**
     * Los permisos de un conjunto de roles, con la pagina y el modulo ya
     * cargados. Es la consulta que construye el menu: UNA, con todo lo que
     * hace falta dentro.
     *
     * Se filtra por activo en los cuatro sitios —permiso, pagina, modulo y
     * rol— porque desactivar cualquiera de ellos tiene que hacer desaparecer
     * la entrada del menu. Si faltara uno, retirar un modulo lo dejaria
     * visible mientras el permiso siguiera vivo.
     */
    @Query("SELECT rp FROM RolePermission rp "
            + "JOIN FETCH rp.page p JOIN FETCH p.module m JOIN FETCH rp.role r "
            + "WHERE r.name IN :roles AND rp.active = true AND rp.canRead = true "
            + "AND p.active = true AND m.active = true AND r.active = true "
            + "ORDER BY m.sortOrder ASC, p.sortOrder ASC")
    List<RolePermission> findParaRoles(@Param("roles") Collection<String> roles);

    @Query("SELECT rp FROM RolePermission rp "
            + "JOIN FETCH rp.page p JOIN FETCH p.module m JOIN FETCH rp.role r "
            + "WHERE r.name = :rol ORDER BY m.sortOrder ASC, p.sortOrder ASC")
    List<RolePermission> findTodosDelRol(@Param("rol") String rol);

    Optional<RolePermission> findByRoleIdAndPageId(Long roleId, Long pageId);

    long countByPageId(Long pageId);
}
