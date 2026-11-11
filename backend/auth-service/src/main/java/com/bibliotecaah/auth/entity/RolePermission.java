package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Que puede hacer un rol en una pagina.
 *
 * Cuatro banderas y no una: "puede entrar" y "puede borrar" no son la misma
 * pregunta, y un modelo que solo dice si la pantalla se ve obliga a repetir la
 * decision dentro de cada pantalla, que es donde se olvida.
 *
 * NO EXISTIR ES NO PODER. Si no hay fila para (rol, pagina), ese rol no tiene
 * nada en esa pagina. La alternativa —una fila con los cuatro campos en falso
 * como estado por defecto— obliga a mantener el producto cartesiano de roles
 * por paginas al dia, y el dia que se anade una pagina y se olvida la fila,
 * el sistema tendria que decidir solo, y decidiria mal.
 */
@Entity
@Table(
        name = "bah_auth_role_permission",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_permiso_rol_pagina",
                columnNames = {"role_id", "page_id"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class RolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "page_id", nullable = false)
    private Page page;

    @Column(name = "can_read", nullable = false)
    @Builder.Default
    private Boolean canRead = true;

    @Column(name = "can_create", nullable = false)
    @Builder.Default
    private Boolean canCreate = false;

    @Column(name = "can_update", nullable = false)
    @Builder.Default
    private Boolean canUpdate = false;

    @Column(name = "can_delete", nullable = false)
    @Builder.Default
    private Boolean canDelete = false;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
