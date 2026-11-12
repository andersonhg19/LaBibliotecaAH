package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** (v1.6) Crear (sin id, dentro de padreId o en la raiz) o renombrar (con id) una carpeta. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarpetaSaveDTO {
    private UUID id;
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 100, message = "{validacion.maximo}")
    private String nombre;
    /** Solo al crear; para cambiar una carpeta de sitio esta /carpetas/mover. */
    private UUID padreId;
}
