package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** Traducir un capitulo entero de un libro propio, frase a frase. Contratos v1.3. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Capitulo a traducir (la primera llamada lo lanza; las siguientes lo consultan)")
public class TraducirCapituloDTO {
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "3f1c2a7e-8a4b-4c1e-9d55-2b1f0c3d4e5f")
    private UUID ejemplarId;
    @NotNull(message = "{validacion.obligatorio}")
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 999, message = "{validacion.rango}")
    @Schema(example = "3")
    private Integer capitulo;
    /** "es" (por defecto "es"). */
    @Size(max = 10, message = "{validacion.maximo}")
    @Schema(example = "es", defaultValue = "es")
    private String destino;
    /** true = volver a intentar ya un capitulo que acaba de quedar en ERROR. */
    @Schema(example = "false")
    private Boolean reintentar;
}
