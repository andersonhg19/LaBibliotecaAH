package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.TipoAnotacion;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Resaltado, nota o marcador. Guarda las TRES anclas del plan (7.3): CFI,
 * frase+offset con version del texto, y cita textual con prefijo/sufijo.
 */
@Entity
@Table(name = "bah_lib_anotacion")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Anotacion extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "ejemplar_id", nullable = false)
    private UUID ejemplarId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TipoAnotacion tipo;

    @Column(length = 30)
    private String color;

    @Column(columnDefinition = "text")
    private String cfi;

    @Column(name = "frase_inicio", length = 20)
    private String fraseInicio;

    @Column(name = "offset_inicio")
    private Integer offsetInicio;

    @Column(name = "frase_fin", length = 20)
    private String fraseFin;

    @Column(name = "offset_fin")
    private Integer offsetFin;

    @Column(name = "version_texto")
    private Integer versionTexto;

    @Column(name = "texto_citado", columnDefinition = "text")
    private String textoCitado;

    @Column(columnDefinition = "text")
    private String prefijo;

    @Column(columnDefinition = "text")
    private String sufijo;

    @Column(columnDefinition = "text")
    private String nota;

    private Integer capitulo;

    private Instant editado;
}
