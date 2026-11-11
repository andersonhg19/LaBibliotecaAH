package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

/** Edicion parcial: lo que llega en nulo no se toca. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LibroSaveDTO {
    @NotNull(message = "{validacion.obligatorio}")
    private UUID id;
    @Size(max = 500, message = "{validacion.maximo}")
    private String titulo;
    private List<String> autores;
    private Integer anio;
    @Size(max = 300, message = "{validacion.maximo}")
    private String editorial;
    private String sinopsis;
    private List<String> generos;
    private List<String> etiquetas;
    private EstadoLectura estado;
    private Double calificacion;
    private Boolean favorito;
    private TipoEjemplar tipo;
}
