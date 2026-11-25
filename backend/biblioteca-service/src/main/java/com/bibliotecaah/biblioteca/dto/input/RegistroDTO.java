package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.List;

/**
 * (0.5.0, C11) POST /v1/libros/registro: apuntar un libro ya leido (o por leer, o abandonado) sin subir el
 * archivo. Queda como ejemplar LIBRO sin archivo: sale en las pestanas de libros, en las facetas y en las
 * estadisticas, pero no tiene lector, voz ni portada.
 */
@Schema(description = "Libro solo registro (sin archivo)")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegistroDTO {
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 500, message = "{validacion.maximo}")
    @Schema(example = "Cien años de soledad")
    private String titulo;
    @Size(max = 20, message = "{validacion.maximoElementos}")
    @Schema(example = "[\"Gabriel García Márquez\"]")
    private List<@Size(max = 300, message = "{validacion.maximo}") String> autores;
    /** Por defecto LEIDO. */
    @Schema(example = "LEIDO", nullable = true)
    private EstadoLectura estado;
    /** Solo con estado LEIDO; no futura. Sin ella, la fecha de fin queda vacia (no se sabe cuando). */
    @Schema(example = "2024-03-15T00:00:00Z", nullable = true)
    private Instant fechaFin;
    /** 0,5 a 5 en pasos de 0,5. */
    @Schema(example = "4.5", nullable = true)
    private Double calificacion;
    @Size(max = 2000, message = "{validacion.maximo}")
    @Schema(example = "Lo leí en el colegio", nullable = true)
    private String nota;
}
