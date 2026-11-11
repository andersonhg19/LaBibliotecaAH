package com.bibliotecaah.biblioteca.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** Diario de lectura: "lo empece en el bus...". */
@Entity
@Table(name = "bah_lib_comentario")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Comentario extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "ejemplar_id", nullable = false)
    private UUID ejemplarId;

    @Column(nullable = false, columnDefinition = "text")
    private String texto;
}
