package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** Para agregar, quitar y ordenar. antesDe/despuesDe solo aplican a ordenar. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EstanteEjemplarDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID ejemplarId;
    private UUID antesDe;
    private UUID despuesDe;
}
