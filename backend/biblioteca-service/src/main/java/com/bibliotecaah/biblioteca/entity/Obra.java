package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Los datos bibliograficos. Una obra por ejemplar (ver V1__esquema.sql): la
 * correccion de datos que hace un usuario no cambia la copia del otro.
 * Autores y generos son text[] de PostgreSQL: simple y filtrable.
 */
@Entity
@Table(name = "bah_lib_obra")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Obra extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(nullable = false, length = 500)
    private String titulo;

    @Column(length = 500)
    private String subtitulo;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    @Builder.Default
    private List<String> autores = new ArrayList<>();

    private Integer anio;

    @Column(length = 300)
    private String editorial;

    @Column(length = 20)
    private String idioma;

    @Column(length = 20)
    private String isbn;

    @Column(columnDefinition = "text")
    private String sinopsis;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    @Builder.Default
    private List<String> generos = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "fuente_metadatos", nullable = false, length = 20)
    private FuenteMetadatos fuenteMetadatos;
}
