package com.bibliotecaah.biblioteca.entity;

import com.bibliotecaah.biblioteca.util.SecurityUtils;
import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.time.Instant;

/**
 * Campos de auditoria de toda entidad del dominio (estandares §18): cuando se
 * creo, cuando se toco por ultima vez y quien la toco. Nunca salen en los DTO de
 * salida. Una tarea programada (sin usuario) deja idModifiedBy en nulo.
 */
@MappedSuperclass
@Getter
@Setter
@NoArgsConstructor
@SuperBuilder
public abstract class EntidadAuditable {

    @Column(name = "creation", nullable = false, updatable = false)
    private Instant creation;

    @Column(name = "last_update", nullable = false)
    private Instant lastUpdate;

    @Column(name = "id_modified_by")
    private Long idModifiedBy;

    @PrePersist
    void auditarAlta() {
        Instant ahora = Instant.now();
        if (creation == null) creation = ahora;
        lastUpdate = ahora;
        idModifiedBy = SecurityUtils.getAuthenticatedUserId();
        antesDeGuardar();
    }

    @PreUpdate
    void auditarCambio() {
        lastUpdate = Instant.now();
        idModifiedBy = SecurityUtils.getAuthenticatedUserId();
        antesDeGuardar();
    }

    /** Gancho para valores por defecto propios de cada entidad. */
    protected void antesDeGuardar() {
    }
}
