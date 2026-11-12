package com.bibliotecaah.biblioteca.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** (v1.6) Una carpeta del archivador de documentos de un usuario; padreId null = raiz. */
@Entity
@Table(name = "bah_lib_carpeta")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Carpeta extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "padre_id")
    private UUID padreId;

    @Column(nullable = false, length = 100)
    private String nombre;
}
