package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** (0.4.0, C5) POST /v1/voz/preparar-libro. */
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
}
