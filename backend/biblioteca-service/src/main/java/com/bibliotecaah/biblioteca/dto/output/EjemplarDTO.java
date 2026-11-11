package com.bibliotecaah.biblioteca.dto.output;

import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** contratos.md §9: EjemplarDTO. */
@Getter
@Setter
@NoArgsConstructor
public class EjemplarDTO {

    private UUID id;
    private UUID archivoId;
    private TipoEjemplar tipo;
    private EstadoLectura estado;
    private String titulo;
    private String subtitulo;
    private List<String> autores = new ArrayList<>();
    private Integer anio;
    private String editorial;
    private String idioma;
    private String isbn;
    private String sinopsis;
    private List<String> generos = new ArrayList<>();
    private List<String> etiquetas = new ArrayList<>();
    private Double calificacion;
    private boolean favorito;
    private Formato formatoOriginal;
    private String estadoConversion;
    private boolean tienePortada;
    private Integer minutosEstimados;
    private double porcentaje;
    private Instant fechaLlegada;
    private Instant ultimaApertura;
    private Instant fechaFin;
    private long nNotas;
    private FuenteMetadatos fuenteMetadatos;

    /* Lombok generaria getNNotas(), que Jackson publica como "nnotas". */
    @JsonProperty("nNotas")
    public long getNNotas() {
        return nNotas;
    }
}
