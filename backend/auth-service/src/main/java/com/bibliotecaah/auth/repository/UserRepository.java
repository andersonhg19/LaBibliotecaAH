package com.bibliotecaah.auth.repository;

import com.bibliotecaah.auth.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailAndActiveTrue(String email);

    /** Activa o no: la semilla la usa para no duplicar una cuenta desactivada. */
    Optional<User> findByEmail(String email);

    Optional<User> findByIdAndActiveTrue(Long id);

    /** El alias se guarda ya en minusculas: quien llama lo pasa normalizado. */
    Optional<User> findByAliasAndActiveTrue(String alias);

    /**
     * Las cuentas activas cuyo correo coincide sin distinguir mayusculas.
     * Devuelve lista y no Optional porque la unicidad del correo en la base SI
     * distingue mayusculas: "Ana@x" y "ana@x" pueden convivir, y entonces el
     * login no debe elegir una al azar (ver IdentidadDeLogin).
     */
    @Query("SELECT u FROM User u WHERE LOWER(u.email) = :correo AND u.active = true")
    List<User> buscarActivosPorCorreoSinMayusculas(@Param("correo") String correo);

    /** Activa o no: la restriccion unica de la base tampoco distingue. */
    boolean existsByAlias(String alias);

    boolean existsByAliasAndIdNot(String alias, Long id);

    /**
     * El usuario con sus roles ya cargados. La relacion es perezosa a
     * proposito, asi que quien necesita los roles fuera de la transaccion
     * —firmar el token, sin ir mas lejos— los pide aqui y no se lleva un
     * LazyInitializationException a las manos.
     */
    @Query("SELECT u FROM User u LEFT JOIN FETCH u.roles WHERE u.email = :email AND u.active = true")
    Optional<User> findByEmailAndActiveTrueWithRoles(@Param("email") String email);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.roles WHERE u.id = :id")
    Optional<User> findByIdWithRoles(@Param("id") Long id);

    boolean existsByEmailAndActiveTrue(String email);

    /**
     * ¿Hay ya una cuenta (ACTIVA O NO) con ese correo, sin distinguir
     * mayusculas? Quien llama lo pasa normalizado. Activa o no porque la
     * restriccion unica de la base tampoco distingue (QA SE-10: registrar el
     * correo de una cuenta desactivada daba un 500).
     */
    @Query("SELECT COUNT(u) > 0 FROM User u WHERE LOWER(u.email) = :correo")
    boolean existeCorreo(@Param("correo") String correo);

    @Query("SELECT COUNT(u) > 0 FROM User u WHERE LOWER(u.email) = :correo AND u.id <> :id")
    boolean existeCorreoEnOtraCuenta(@Param("correo") String correo, @Param("id") Long id);

    @Query("SELECT new com.bibliotecaah.auth.repository.EstadoDeSesion(u.active, u.versionSesion) "
            + "FROM User u WHERE u.id = :id")
    Optional<EstadoDeSesion> estadoDeSesion(@Param("id") Long id);

    boolean existsByEmailAndActiveTrueAndIdNot(String email, Long id);

    @Query("SELECT u FROM User u WHERE u.active = true " +
            "AND (:name IS NULL OR LOWER(CAST(u.name AS string)) LIKE LOWER(CONCAT('%', CAST(:name AS string), '%'))) " +
            "AND (:email IS NULL OR LOWER(CAST(u.email AS string)) LIKE LOWER(CONCAT('%', CAST(:email AS string), '%')))")
    Page<User> findAllWithFilters(@Param("name") String name,
                                  @Param("email") String email,
                                  Pageable pageable);

    /**
     * El listado que ve un administrador. Se diferencia del de arriba en una
     * cosa que importa: aqui las cuentas desactivadas SI salen, filtrables por
     * el parametro. Una pantalla de administracion que no puede ver lo que
     * desactivo no sirve para reactivarlo.
     */
    @Query("SELECT u FROM User u WHERE " +
            "(:active IS NULL OR u.active = :active) " +
            "AND (:name IS NULL OR LOWER(CAST(u.name AS string)) LIKE LOWER(CONCAT('%', CAST(:name AS string), '%'))) " +
            "AND (:email IS NULL OR LOWER(CAST(u.email AS string)) LIKE LOWER(CONCAT('%', CAST(:email AS string), '%')))")
    Page<User> findAllForAdmin(@Param("name") String name,
                               @Param("email") String email,
                               @Param("active") Boolean active,
                               Pageable pageable);

    /**
     * Los roles de una pagina entera de usuarios en UNA consulta.
     *
     * Sin esto, pintar diez fichas con sus roles son once consultas: la del
     * listado mas una por usuario al tocar la coleccion perezosa. Es el N+1 de
     * manual, y aqui se evita pidiendo primero la pagina y luego los roles de
     * esos ids de una vez.
     */
    @Query("SELECT DISTINCT u FROM User u LEFT JOIN FETCH u.roles WHERE u.id IN :ids")
    List<User> findAllByIdWithRoles(@Param("ids") List<Long> ids);

    /**
     * Cuantas cuentas ACTIVAS llevan ese rol. Es la consulta que impide que la
     * plataforma se quede sin ningun administrador.
     */
    @Query("SELECT COUNT(DISTINCT u) FROM User u JOIN u.roles r " +
            "WHERE r.name = :rol AND u.active = true AND r.active = true")
    long contarActivosConRol(@Param("rol") String rol);

    @Query("SELECT COUNT(DISTINCT u) FROM User u JOIN u.roles r " +
            "WHERE r.id = :roleId AND u.active = true")
    long contarActivosConRolId(@Param("roleId") Long roleId);
}
