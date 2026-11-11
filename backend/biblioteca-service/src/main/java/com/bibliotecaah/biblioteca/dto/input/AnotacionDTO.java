package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.TipoAnotacion;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Resaltado, nota o marcador con sus tres anclas (plan 7.3). Entrada y salida. */
@Schema(description = "Anotacion sobre el texto de un libro")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnotacionDTO {
    private UUID id;
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "3f1c2a7e-8a4b-4c1e-9d55-2b1f0c3d4e5f")
    private UUID ejemplarId;
    @NotNull(message = "{validacion.obligatorio}")
    @Schema(example = "RESALTADO")
    private TipoAnotacion tipo;
    @Schema(example = "amarillo")
    private String color;
    @Schema(example = "epubcfi(/6/8!/4/2/10,/1:0,/1:42)")
    private String cfi;
    @Schema(example = "c003-s00123")
    private String fraseInicio;
    @Schema(example = "0")
    private Integer offsetInicio;
    @Schema(example = "c003-s00124")
    private String fraseFin;
    @Schema(example = "42")
    private Integer offsetFin;
    @Schema(example = "1")
    private Integer versionTexto;
    @Schema(example = "En un lugar de la Mancha")
    private String textoCitado;
    private String prefijo;
    private String sufijo;
    @Schema(example = "Me encanta este comienzo")
    private String nota;
    @Schema(example = "3")
    private Integer capitulo;
    private Instant creado;
    private Instant editado;
}
