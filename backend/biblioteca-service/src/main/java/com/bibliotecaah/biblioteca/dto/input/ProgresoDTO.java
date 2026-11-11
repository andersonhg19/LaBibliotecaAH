package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.ModoLectura;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Entrada y salida de /v1/progreso. actualizadoEn lo pone el cliente (ISO-8601). */
@Schema(description = "Donde va el usuario en un libro")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProgresoDTO {
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "3f1c2a7e-8a4b-4c1e-9d55-2b1f0c3d4e5f")
    private UUID ejemplarId;
    @Schema(example = "3")
    private Integer capitulo;
    @Schema(example = "c003-s00123")
    private String fraseId;
    @Schema(example = "epubcfi(/6/8!/4/2/10)")
    private String cfi;
    @Schema(example = "512.4")
    private Double posicionAudioSeg;
    @Schema(example = "edge.es-ES-AlvaroNeural")
    private String vozId;
    @Schema(example = "1.5")
    private Double velocidad;
    @Schema(example = "37.5")
    private Double porcentaje;
    @Schema(example = "VOZ")
    private ModoLectura modo;
    @Schema(example = "iPhone de Anderson")
    private String dispositivo;
    @Schema(example = "2026-11-10T20:15:00Z")
    private Instant actualizadoEn;
}
