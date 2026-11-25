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
    /** (v1.6) Carpeta del archivador donde esta el documento; null = raiz (y siempre en libros y deseos). */
    private UUID carpetaId;
    /** Nota del deseo ("regalo de cumpleanos") o del libro solo registro (0.5.0, C11); null si no tiene. */
    private String nota;
    /**
     * Solo en la respuesta de /libros/subir: true si ese archivo ya estaba en tu
     * biblioteca (no se agrego otro). Ausente en el resto de respuestas (QA BI-16).
     */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean yaLoTenias;

    /**
     * (0.5.0, C11) true si el ejemplar no tiene archivo: un deseo o un libro "solo registro". Sin archivo no
     * hay lector, voz, portada ni preparacion: la web no ofrece Escuchar/Leer.
     */
    @JsonProperty("sinArchivo")
    @io.swagger.v3.oas.annotations.media.Schema(description = "true = deseo o libro solo registro (sin archivo)",
            accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.READ_ONLY)
    public boolean isSinArchivo() {
        return archivoId == null;
    }

    /* Lombok generaria getNNotas(), que Jackson publica como "nnotas". */
    @JsonProperty("nNotas")
    public long getNNotas() {
        return nNotas;
    }
}
