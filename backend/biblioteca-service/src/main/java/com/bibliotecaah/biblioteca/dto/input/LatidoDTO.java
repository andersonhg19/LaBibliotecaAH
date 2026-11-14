package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.ModoSesion;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * (0.4.0, C4) POST /v1/sesiones/latido. {@code sesionId} lo genera el cliente (uuid) y se repite en
 * cada latido de la misma sesion; sin el, el servidor crea una sesion nueva y devuelve su id.
 * {@code segundos} = desde el latido anterior (0..120).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LatidoDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID ejemplarId;
    @NotNull(message = "{validacion.obligatorio}")
    private ModoSesion modo;
    private UUID sesionId;
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 99_999, message = "{validacion.rango}")
    private Integer capitulo;
    /** Posicion dentro del capitulo (fraccion, porcentaje o segundos de audio: la guarda tal cual). */
    private Double posicion;
    @NotNull(message = "{validacion.obligatorio}")
    @Min(value = 0, message = "{validacion.noNegativo}")
    @Max(value = 120, message = "{validacion.rango}")
    private Integer segundos;
    @Size(max = 40, message = "{validacion.maximo}")
    private String dispositivo;
}
