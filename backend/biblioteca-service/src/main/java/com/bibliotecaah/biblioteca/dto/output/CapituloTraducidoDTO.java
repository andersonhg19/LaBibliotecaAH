package com.bibliotecaah.biblioteca.dto.output;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CapituloTraducidoDTO {
    /** LISTO | PENDIENTE | ERROR */
    @Schema(example = "LISTO", allowableValues = {"LISTO", "PENDIENTE", "ERROR"})
    private String estado;
    /** Con LISTO, todas las frases del capitulo en orden; vacia en PENDIENTE y ERROR. */
    @Builder.Default
    private List<FraseTraducidaDTO> frases = new ArrayList<>();
    /** Con ERROR, el motivo; null en los demas. */
    private String error;
    /** Porcentaje de frases ya traducidas (0-100): 100 en LISTO. */
    @Schema(example = "100")
    private int progreso;
}
