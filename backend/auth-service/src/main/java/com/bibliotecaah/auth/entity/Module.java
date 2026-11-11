package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Un modulo es una APLICACION dentro de la plataforma.
 *
 * En La Biblioteca AH hay dos: la biblioteca y la administracion.
 *
 * Con esto, una aplicacion nueva es una fila y sus paginas, y quien la ve lo
 * decide un permiso. Es el paso que HexaQuantum resuelve con
 * Module -> Pages -> PageTypeUser, adaptado a que aqui no hay empresas ni
 * sucursales: hay personas.
 */
@Entity
@Table(name = "bah_auth_module")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Module {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    /**
     * El identificador estable, el que usa el codigo. El nombre visible puede
     * cambiar —"Ayuno" pasar a "Salud"— sin que se rompa nada que lo referencie.
     */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 50)
    private String icon;

    /** En que orden se pinta. Empatados, manda el nombre. */
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
