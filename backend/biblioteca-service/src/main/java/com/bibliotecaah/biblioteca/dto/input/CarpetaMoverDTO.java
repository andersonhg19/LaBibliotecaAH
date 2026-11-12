package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** (v1.6) Mover una carpeta (con todo lo suyo) dentro de otra; destinoId null = a la raiz. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarpetaMoverDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID carpetaId;
    private UUID destinoId;
}
