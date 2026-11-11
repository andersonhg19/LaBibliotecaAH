package com.bibliotecaah.biblioteca.dto.input;

import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Edicion parcial. Desde v1.2 se distingue "no enviado" de "null explicito"
 * (QA BI-07, BI-08):
 *  · un campo AUSENTE del JSON no se toca;
 *  · un campo enviado como null se VACIA (anio, calificacion, editorial,
 *    sinopsis; las listas quedan vacias). titulo, estado, tipo y favorito no
 *    se pueden vaciar: null en ellos = no tocar.
 *
 * Jackson solo llama al setter de los campos que vienen en el JSON (tambien con
 * null), asi que los setters de abajo apuntan que llegaron.
 *
 * Topes (QA SE-07, BI-25): 20 autores de 300, 20 generos de 100, 50 etiquetas
 * de 50, sinopsis de 10 000; anio de -3000 a 2100 (QA BI-18).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LibroSaveDTO {

    public static final int ANIO_MINIMO = -3000;
    public static final int ANIO_MAXIMO = 2100;

    @NotNull(message = "{validacion.obligatorio}")
    private UUID id;
    @Size(max = 500, message = "{validacion.maximo}")
    private String titulo;
    @Size(max = 20, message = "{validacion.maximoElementos}")
    private List<@Size(max = 300, message = "{validacion.maximo}") String> autores;
    @Min(value = ANIO_MINIMO, message = "{validacion.anio}")
    @Max(value = ANIO_MAXIMO, message = "{validacion.anio}")
    private Integer anio;
    @Size(max = 300, message = "{validacion.maximo}")
    private String editorial;
    @Size(max = 10000, message = "{validacion.maximo}")
    private String sinopsis;
    @Size(max = 20, message = "{validacion.maximoElementos}")
    private List<@Size(max = 100, message = "{validacion.maximo}") String> generos;
    @Size(max = 50, message = "{validacion.maximoElementos}")
    private List<@Size(max = 50, message = "{validacion.maximo}") String> etiquetas;
    private EstadoLectura estado;
    private Double calificacion;
    private Boolean favorito;
    private TipoEjemplar tipo;

    /** Los campos que llegaron en el JSON, aunque fuera con null. */
    @JsonIgnore
    @Schema(hidden = true)
    @Builder.Default
    private Set<String> enviados = new HashSet<>();

    /** ¿Llego el campo (con valor o con null)? */
    public boolean enviado(String campo) {
        return enviados != null && enviados.contains(campo);
    }

    /** ¿Hay que escribir el campo? Si llego con valor, o si llego como null para vaciarlo. */
    public boolean tocar(String campo, Object valor) {
        return valor != null || enviado(campo);
    }

    private void marcar(String campo) {
        if (enviados == null) enviados = new HashSet<>();
        enviados.add(campo);
    }

    public void setAutores(List<String> autores) {
        this.autores = autores;
        marcar("autores");
    }

    public void setAnio(Integer anio) {
        this.anio = anio;
        marcar("anio");
    }

    public void setEditorial(String editorial) {
        this.editorial = editorial;
        marcar("editorial");
    }

    public void setSinopsis(String sinopsis) {
        this.sinopsis = sinopsis;
        marcar("sinopsis");
    }

    public void setGeneros(List<String> generos) {
        this.generos = generos;
        marcar("generos");
    }

    public void setEtiquetas(List<String> etiquetas) {
        this.etiquetas = etiquetas;
        marcar("etiquetas");
    }

    public void setCalificacion(Double calificacion) {
        this.calificacion = calificacion;
        marcar("calificacion");
    }
}
