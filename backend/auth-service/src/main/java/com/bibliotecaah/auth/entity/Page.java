package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Una pantalla dentro de un modulo.
 *
 * El campo que hace el trabajo es "route": el nombre con el que el navegador
 * del movil conoce esa pantalla. Sin el, el menu seria una lista de rotulos
 * bonitos sin sitio al que ir.
 */
@Entity
@Table(
        name = "bah_auth_page",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_pagina_modulo_codigo",
                columnNames = {"module_id", "code"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Page {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "module_id", nullable = false)
    private Module module;

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** El nombre de la ruta en la navegacion del movil. */
    @Column(nullable = false, length = 100)
    private String route;

    @Column(length = 50)
    private String icon;

    /**
     * Si sale en la barra de navegacion o solo se alcanza desde dentro. El
     * formulario de un movimiento es una pagina con permisos, pero no una
     * pestaña.
     */
    @Column(name = "in_menu", nullable = false)
    @Builder.Default
    private Boolean inMenu = true;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
