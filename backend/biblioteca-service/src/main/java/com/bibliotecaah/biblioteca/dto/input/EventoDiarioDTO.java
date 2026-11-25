package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * (0.5.0, C9) Un evento del reproductor. {@code contexto} es un objeto plano (valores texto, numero,
 * booleano o null) de hasta 2 KB, con {@code ua} de hasta 200 caracteres: lo comprueba DiarioServiceImpl.
 */
@Schema(description = "Un evento del reproductor (atasco, pausa del sistema, error de audio...)")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventoDiarioDTO {
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "2026-11-25T21:03:11.120Z")
    private Instant cuando;
    @NotNull(message = "{validacion.obligatorio}")
    @Size(max = 40, message = "{validacion.maximo}")
    @Pattern(regexp = "^[a-z0-9-]+$", message = "{validacion.tipoDiario}")
    @Schema(example = "atasco")
    private String tipo;
    @Schema(example = "3f1c2a7e-8a4b-4c1e-9d55-2b1f0c3d4e5f", nullable = true)
    private UUID ejemplarId;
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 99_999, message = "{validacion.rango}")
    @Schema(example = "3")
    private Integer capitulo;
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 10_000_000, message = "{validacion.rango}")
    @Schema(example = "812.4")
    private Double posicion;
    @Size(max = 500, message = "{validacion.maximo}")
    @Schema(example = "currentTime sin avanzar 8 s")
    private String detalle;
    @Schema(example = "{\"standalone\": true, \"cinta\": true, \"visible\": false, \"red\": true, "
            + "\"ua\": \"Mozilla/5.0 (iPhone...)\", \"version\": \"0.5.0\"}")
    private Map<String, Object> contexto;
}
