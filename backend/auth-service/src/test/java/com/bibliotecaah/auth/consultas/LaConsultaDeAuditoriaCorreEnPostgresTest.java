package com.bibliotecaah.auth.consultas;

import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.repository.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QA A2: Ajustes › Auditoria nunca cargaba. `/v1/admin/audit/all` respondia
 * errorCode 500 con cualquier filtro, incluido `{}`.
 *
 * La causa: `(:desde IS NULL OR ...)` con un LocalDateTime. Hibernate 6 manda
 * cada aparicion del parametro como un `?` distinto, y el driver de PostgreSQL
 * envia las fechas con tipo "sin especificar"; el `? IS NULL` suelto queda sin
 * tipo y el servidor responde "could not determine data type of parameter".
 * En H2 no pasa nada, por eso la suite estaba verde.
 */
@DisplayName("La consulta de auditoria funciona en PostgreSQL")
class LaConsultaDeAuditoriaCorreEnPostgresTest extends PostgresDeVerdad {

    @Autowired private AuditLogRepository auditoria;

    @BeforeEach
    void sembrar() {
        auditoria.deleteAll();
        LocalDateTime ahora = LocalDateTime.now();
        auditoria.saveAll(List.of(
                linea(1L, "User", ahora.minusDays(1)),
                linea(1L, "Role", ahora.minusDays(10)),
                linea(2L, "User", ahora.minusDays(40))));
        auditoria.flush();
    }

    private AuditLog linea(Long actor, String tipo, LocalDateTime cuando) {
        return AuditLog.builder().actorUserId(actor).actorEmail("a" + actor + "@biblioteca.ah")
                .entityType(tipo).entityId(actor).action(AuditLog.Accion.LOGIN)
                .details("prueba").occurredAt(cuando).build();
    }

    @Test
    @DisplayName("sin ningun filtro trae todo, de lo mas nuevo a lo mas viejo")
    void sinFiltros() {
        Page<AuditLog> pagina = auditoria.buscar(null, null, null, PageRequest.of(0, 20));

        assertThat(pagina.getTotalElements()).isEqualTo(3);
        assertThat(pagina.getContent()).extracting(AuditLog::getEntityType)
                .containsExactly("User", "Role", "User");
    }

    @Test
    @DisplayName("con todos los filtros puestos recorta por actor, tipo y fecha")
    void conFiltros() {
        Page<AuditLog> pagina = auditoria.buscar(1L, "User",
                LocalDateTime.now().minusDays(5), PageRequest.of(0, 20));

        assertThat(pagina.getContent()).hasSize(1);
        assertThat(pagina.getContent().get(0).getActorUserId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("solo la fecha: deja fuera lo anterior")
    void soloFecha() {
        Page<AuditLog> pagina = auditoria.buscar(null, null,
                LocalDateTime.now().minusDays(30), PageRequest.of(0, 20));

        assertThat(pagina.getTotalElements()).isEqualTo(2);
    }
}
