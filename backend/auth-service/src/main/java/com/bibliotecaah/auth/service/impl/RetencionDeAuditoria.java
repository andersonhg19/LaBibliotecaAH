package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * La auditoria tambien caduca.
 *
 * Una tabla que solo crece es una bomba de disco a doce meses vista. El plazo
 * se configura (audit.retention-days) y se anota cuantas filas se fueron: un
 * borrado silencioso de datos historicos es indistinguible de una perdida.
 *
 * Corre de madrugada porque el borrado toma bloqueos sobre la tabla y a esa
 * hora no hay nadie mirando el registro.
 */
@Slf4j
@Component
public class RetencionDeAuditoria {

    private final AuditLogRepository auditoria;

    @Value("${audit.retention-days:365}")
    private int diasQueSeGuardan;

    public RetencionDeAuditoria(AuditLogRepository auditoria) {
        this.auditoria = auditoria;
    }

    @Scheduled(cron = "${audit.cleanup-cron:0 30 3 * * *}")
    @Transactional
    public void limpiar() {
        /* Un plazo de cero o negativo borraria TODO en el primer pase. Si
           alguien se equivoca configurando, la respuesta correcta es no hacer
           nada y decirlo, no vaciar la tabla. */
        if (diasQueSeGuardan <= 0) {
            log.warn("audit.retention-days vale {}: no se borra nada", diasQueSeGuardan);
            return;
        }

        LocalDateTime limite = LocalDateTime.now().minusDays(diasQueSeGuardan);
        int borradas = auditoria.borrarAnterioresA(limite);
        if (borradas > 0) {
            log.info("Auditoria: {} lineas anteriores a {} borradas por retencion", borradas, limite);
        }
    }
}
