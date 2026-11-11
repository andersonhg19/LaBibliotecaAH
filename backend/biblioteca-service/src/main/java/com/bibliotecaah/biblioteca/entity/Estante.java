package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.TipoEstante;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "bah_lib_estante")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Estante extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(nullable = false, length = 100)
    private String nombre;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TipoEstante tipo;

    @Column(name = "color_madera", length = 30)
    private String colorMadera;

    @Column(nullable = false)
    @Builder.Default
    private Integer orden = 0;
}
