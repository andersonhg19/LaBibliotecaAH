package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Diario de lectura de un libro. Entrada y salida. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ComentarioDTO {
    private UUID id;
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "3f1c2a7e-8a4b-4c1e-9d55-2b1f0c3d4e5f")
    private UUID ejemplarId;
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 10000, message = "{validacion.maximo}")
    @Schema(example = "Lo empece en el bus de vuelta a casa")
    private String texto;
    private Instant creado;
}
