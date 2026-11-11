package com.bibliotecaah.biblioteca.dto.output;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TraduccionDTO {
    @Schema(example = "Era un día frío y luminoso de abril, y los relojes daban las trece.")
    private String traduccion;
    /** El idioma de origen: el pedido, o el detectado si se pidio "auto" (null si no se pudo saber). */
    @Schema(example = "en")
    private String origenDetectado;
}
