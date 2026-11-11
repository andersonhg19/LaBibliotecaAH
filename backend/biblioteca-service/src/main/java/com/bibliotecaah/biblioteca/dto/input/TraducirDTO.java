package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Traducir un texto suelto (una frase o un parrafo seleccionado en el lector). Contratos v1.3. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Texto a traducir con el traductor autoalojado")
public class TraducirDTO {
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 5000, message = "{validacion.maximo}")
    @Schema(example = "It was a bright cold day in April, and the clocks were striking thirteen.")
    private String texto;
    /** "en" o "auto" (por defecto "auto"). */
    @Size(max = 10, message = "{validacion.maximo}")
    @Schema(example = "auto", defaultValue = "auto")
    private String origen;
    /** "es" (por defecto "es"). */
    @Size(max = 10, message = "{validacion.maximo}")
    @Schema(example = "es", defaultValue = "es")
    private String destino;
}
