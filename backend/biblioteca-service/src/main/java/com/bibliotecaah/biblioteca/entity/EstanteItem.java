package com.bibliotecaah.biblioteca.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.UUID;

/** Un ejemplar dentro de un estante, con orden fraccional. */
@Entity
@Table(name = "bah_lib_estante_item")
@IdClass(EstanteItem.Clave.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@lombok.experimental.SuperBuilder
public class EstanteItem extends EntidadAuditable {

    @Id
    @Column(name = "estante_id")
    private UUID estanteId;

    @Id
    @Column(name = "ejemplar_id")
    private UUID ejemplarId;

    @Column(nullable = false)
    private Double orden;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @lombok.EqualsAndHashCode
    public static class Clave implements Serializable {
        private UUID estanteId;
        private UUID ejemplarId;
    }
}
