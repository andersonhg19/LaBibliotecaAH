package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.Formato;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * El fichero fisico, deduplicado por sha256 y compartido entre usuarios.
 *
 * Las columnas de conversion (estado, capitulos, palabras, metadatos...) las
 * escribe el taller; aqui solo se leen. La columna JSONB "metadatos" no se mapea:
 * la lee {@code AplicadorDeMetadatos} con SQL, asi el mapeo no depende de como
 * Hibernate trate el JSONB.
 */
@Entity
@Table(name = "bah_lib_archivo")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Archivo {

    public static final String PENDIENTE = "PENDIENTE";
    public static final String PROCESANDO = "PROCESANDO";
    public static final String LISTO = "LISTO";
    public static final String ERROR = "ERROR";

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 64)
    private String sha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "formato_original", nullable = false, length = 10)
    private Formato formatoOriginal;

    @Column(name = "ruta_original", nullable = false, columnDefinition = "text")
    private String rutaOriginal;

    @Column(name = "nombre_original", nullable = false, length = 500)
    private String nombreOriginal;

    @Column(nullable = false)
    private Long tamano;

    @Column(name = "estado_conversion", nullable = false, length = 20)
    @Builder.Default
    private String estadoConversion = PENDIENTE;

    @Column(name = "error_conversion", columnDefinition = "text")
    private String errorConversion;

    @Column(name = "version_texto")
    private Integer versionTexto;

    @Column(name = "n_capitulos")
    private Integer nCapitulos;

    @Column(name = "n_palabras")
    private Integer nPalabras;

    @Column(name = "minutos_estimados")
    private Integer minutosEstimados;

    @Column(name = "tiene_portada", nullable = false)
    @Builder.Default
    private Boolean tienePortada = false;

    @Column(name = "metadatos_aplicados", nullable = false)
    @Builder.Default
    private Boolean metadatosAplicados = false;

    @Column(nullable = false)
    private LocalDateTime creado;

    @Column(nullable = false)
    private LocalDateTime actualizado;

    @PrePersist
    void alCrear() {
        LocalDateTime ahora = LocalDateTime.now();
        if (creado == null) creado = ahora;
        if (actualizado == null) actualizado = ahora;
    }
}
