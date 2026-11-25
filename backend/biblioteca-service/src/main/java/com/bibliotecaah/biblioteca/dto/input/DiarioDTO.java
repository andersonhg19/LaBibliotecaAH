package com.bibliotecaah.biblioteca.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/** (0.5.0, C9) POST /v1/diario: un lote de 1 a 50 eventos del reproductor. El usuario sale del token. */
@Schema(description = "Lote de eventos del diario del reproductor (1..50)")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiarioDTO {

    public static final int MAXIMO_EVENTOS = 50;

    @NotNull(message = "{validacion.obligatorio}")
    @Size(min = 1, max = MAXIMO_EVENTOS, message = "{validacion.lote}")
    private List<@NotNull(message = "{validacion.obligatorio}") @Valid EventoDiarioDTO> eventos;
}
