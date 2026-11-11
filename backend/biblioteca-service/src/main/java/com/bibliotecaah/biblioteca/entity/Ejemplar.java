package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Un libro en la biblioteca de un usuario (o un deseo, sin archivo). */
@Entity
@Table(name = "bah_lib_ejemplar")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class Ejemplar extends EntidadAuditable {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "obra_id", nullable = false)
    private Obra obra;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "archivo_id")
    private Archivo archivo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TipoEjemplar tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private EstadoLectura estado = EstadoLectura.POR_LEER;

    @Column(precision = 2, scale = 1)
    private BigDecimal calificacion;

    @Column(name = "fecha_llegada", nullable = false)
    private Instant fechaLlegada;

    @Column(name = "ultima_apertura")
    private Instant ultimaApertura;

    @Column(name = "fecha_inicio")
    private Instant fechaInicio;

    @Column(name = "fecha_fin")
    private Instant fechaFin;

    @Column(name = "veces_leido", nullable = false)
    @Builder.Default
    private Integer vecesLeido = 0;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    @Builder.Default
    private List<String> etiquetas = new ArrayList<>();

    @Column(columnDefinition = "text")
    private String nota;

    /**
     * Cuando se retiro de la biblioteca (QA BI-01); null = esta en la biblioteca.
     * Un retirado no se ve en ninguna parte, no tiene archivo y conserva su
     * progreso, notas, diario, estantes y calificacion para cuando vuelva.
     */
    @Column(name = "retirado_en")
    private Instant retiradoEn;

    /** sha256 del archivo: con el se reconoce al volver a subirlo. */
    @Column(name = "archivo_sha256", length = 64)
    private String archivoSha256;

    @Override
    protected void antesDeGuardar() {
        if (fechaLlegada == null) fechaLlegada = Instant.now();
    }
}
