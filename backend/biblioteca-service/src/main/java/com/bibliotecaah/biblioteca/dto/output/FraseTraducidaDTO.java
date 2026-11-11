package com.bibliotecaah.biblioteca.dto.output;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Una frase traducida con el MISMO id que en frases/cap-NNN.json y en el EPUB (contratos §3). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FraseTraducidaDTO {
    @Schema(example = "c003-s00000")
    private String id;
    @Schema(example = "Capítulo tres")
    private String texto;
}
