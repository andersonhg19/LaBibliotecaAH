package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.ModoLectura;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Donde va un usuario en un ejemplar. Gana el actualizadoEn mas reciente. */
@Entity
@Table(name = "bah_lib_progreso")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Progreso extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "ejemplar_id", nullable = false)
    private UUID ejemplarId;

    @Column(nullable = false)
    @Builder.Default
    private Integer capitulo = 0;

    @Column(name = "frase_id", length = 20)
    private String fraseId;

    @Column(columnDefinition = "text")
    private String cfi;

    @Column(name = "posicion_audio_seg")
    private Double posicionAudioSeg;

    @Column(name = "voz_id", length = 80)
    private String vozId;

    private Double velocidad;

    @Column(nullable = false)
    @Builder.Default
    private Double porcentaje = 0.0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private ModoLectura modo = ModoLectura.VISTA;

    @Column(length = 100)
    private String dispositivo;

    @Column(name = "actualizado_en", nullable = false)
    private Instant actualizadoEn;
}
