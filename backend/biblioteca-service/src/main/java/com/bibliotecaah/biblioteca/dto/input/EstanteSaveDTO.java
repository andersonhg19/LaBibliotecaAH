package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
public class EstanteSaveDTO {
    private UUID id;
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 100, message = "{validacion.maximo}")
    private String nombre;
    @Size(max = 30, message = "{validacion.maximo}")
    private String colorMadera;
}
