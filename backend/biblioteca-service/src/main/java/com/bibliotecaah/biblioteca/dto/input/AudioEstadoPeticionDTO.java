package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AudioEstadoPeticionDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID ejemplarId;
    @NotBlank(message = "{validacion.obligatorio}")
    private String vozId;
    @NotNull(message = "{validacion.obligatorio}")
    @Min(value = 0, message = "{validacion.noNegativo}")
    private Integer capitulo;
}
