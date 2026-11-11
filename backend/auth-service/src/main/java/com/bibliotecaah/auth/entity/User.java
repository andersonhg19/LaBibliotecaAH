package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "bah_auth_user")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    /**
     * Nombre corto con el que tambien se puede entrar (V3). Siempre en
     * minusculas y recortado, 3 a 30 caracteres [a-z0-9._-], sin @: lo
     * normaliza ValidationUtils.normalizarAlias antes de guardarlo y la base lo
     * exige con ck_usuario_alias_formato. Unico.
     */
    @Column(nullable = false, unique = true, length = 30)
    private String alias;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    /**
     * Version de sesion (V4, QA SE-02). Va en el token como claim "ver". Se
     * sube al desactivar/reactivar la cuenta, cambiarle los roles o cambiar la
     * contrasena: los tokens con una version anterior dejan de valer.
     */
    @Column(name = "version_sesion", nullable = false)
    @Builder.Default
    private Integer versionSesion = 0;

    /** Invalida todos los tokens emitidos hasta ahora para esta cuenta. */
    public void revocarSesiones() {
        versionSesion = (versionSesion == null ? 0 : versionSesion) + 1;
    }

    /**
     * Los roles de esta persona.
     *
     * PEREZOSO Y SIN CASCADA, y las dos cosas a proposito. En los proyectos que
     * sirvieron de referencia esta relacion esta declarada EAGER y con
     * CascadeType.ALL: lo primero arrastra los roles en cada consulta de
     * usuario aunque solo se quiera el nombre, y lo segundo hace que borrar un
     * usuario intente borrar los roles, que son de todos.
     *
     * Como es perezoso, quien necesite los roles fuera de una transaccion los
     * pide explicitamente con findByEmailAndActiveTrueWithRoles.
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "bah_auth_user_role",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public boolean tieneRol(String nombreDelRol) {
        return roles != null && roles.stream()
                .anyMatch(r -> Boolean.TRUE.equals(r.getActive()) && r.getName().equals(nombreDelRol));
    }
}
