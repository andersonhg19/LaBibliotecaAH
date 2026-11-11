package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Quien cambio que, cuando, y de que valor a que valor.
 *
 * Hasta la ola 4 no habia forma de responder a eso. Con roles en juego la
 * pregunta deja de ser academica: si una cuenta amanece con ADMIN, hay que
 * poder decir quien se lo dio y a que hora.
 *
 * TRES DECISIONES
 *
 *  1. ES INMUTABLE. No hay setters de negocio ni fecha de actualizacion: una
 *     linea de auditoria que se puede editar no sirve para lo unico que sirve
 *     una auditoria.
 *
 *  2. GUARDA EL CORREO DEL ACTOR, no solo su id. Si esa cuenta se borra
 *     manana, la linea tiene que seguir diciendo algo. Es duplicar un dato a
 *     proposito, que es lo correcto en un registro historico: describe el
 *     mundo como era entonces, no como es ahora.
 *
 *  3. LOS INDICES ESTAN AQUI DESDE EL PRIMER DIA. Una tabla de auditoria sin
 *     indices y sin borrado es una bomba de disco a doce meses vista, y para
 *     entonces ya tiene demasiadas filas como para indexarla en caliente.
 */
@Entity
@Table(name = "bah_auth_audit_log", indexes = {
        @Index(name = "idx_auditoria_actor", columnList = "actor_user_id"),
        @Index(name = "idx_auditoria_entidad", columnList = "entity_type,entity_id"),
        @Index(name = "idx_auditoria_fecha", columnList = "occurred_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    /** Quien lo hizo. Nulo solo si el cambio no lo origino una persona. */
    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "actor_email", length = 150)
    private String actorEmail;

    @Column(name = "entity_type", nullable = false, length = 60)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    @Column(nullable = false, length = 40)
    @Enumerated(EnumType.STRING)
    private Accion action;

    /**
     * Que cambio, en texto legible. No es JSON estructurado a proposito: aqui
     * se lee, no se consulta por campos, y un formato que se lee de un vistazo
     * vale mas que uno que habria que descodificar para entender.
     */
    @Column(length = 1000)
    private String details;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;

    public enum Accion {
        LOGIN,
        USER_CREATE,
        USER_UPDATE,
        USER_ACTIVATE,
        USER_DEACTIVATE,
        ROLE_CREATE,
        ROLE_UPDATE,
        ROLE_DEACTIVATE,
        ROLES_ASSIGNED,
        PERMISSION_CHANGE
    }
}
