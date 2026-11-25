package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * (0.4.0, C5) POST /v1/voz/preparar-libro. (0.5.0, C10.2) {@code desdeCapitulo}: se encola primero de
 * ese capitulo al final y despues los anteriores; sin el, desde el capitulo del progreso del usuario (0 si
 * no hay progreso).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PrepararLibroDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID ejemplarId;
    @NotBlank(message = "{validacion.obligatorio}")
    private String vozId;
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 99_999, message = "{validacion.rango}")
    @Schema(example = "7", nullable = true)
    private Integer desdeCapitulo;
}
