package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.repository.AuditLogRepository;
import com.bibliotecaah.auth.service.CambioAuditable;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;

/**
 * Quien escribe las lineas de auditoria.
 *
 * TRES DECISIONES, Y LAS TRES SON LA MISMA IDEA: la auditoria no puede
 * estropear lo que audita.
 *
 *  1. DESPUES DEL COMMIT. Con @TransactionalEventListener en AFTER_COMMIT solo
 *     se anota lo que de verdad se guardo. Un listener normal apuntaria
 *     tambien los cambios que luego se deshacen, y el registro diria que paso
 *     algo que no paso.
 *
 *  2. EN OTRO HILO. @Async: aunque escribir la linea tarde, quien pulso el
 *     boton ya tiene su respuesta.
 *
 *  3. SI FALLA, SE QUEJA Y SE CALLA. El catch registra el fallo con el logger
 *     —no con System.err, que en produccion no va a ningun sitio consultable—
 *     y no relanza. Perder una linea de auditoria es malo; tumbar por ella una
 *     operacion que ya esta confirmada en la base de datos es peor, y ademas
 *     no la desharia: el commit ya ocurrio.
 */
@Slf4j
@Component
public class AuditoriaListener {

    private final AuditLogRepository auditoria;

    public AuditoriaListener(AuditLogRepository auditoria) {
        this.auditoria = auditoria;
    }

    /**
     * fallbackExecution: el login NO corre dentro de una transaccion —no
     * escribe nada—, y sin esto su evento se descartaria en silencio. Sería el
     * peor sitio para perder una linea: "quien entro y cuando" es justo lo
     * primero que se mira cuando algo huele mal.
     */
    @Async("auditExecutor")
    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void anotar(CambioAuditable cambio) {
        try {
            auditoria.save(AuditLog.builder()
                    .actorUserId(cambio.actorUserId())
                    .actorEmail(cambio.actorEmail())
                    .entityType(cambio.entityType())
                    .entityId(cambio.entityId())
                    .action(cambio.action())
                    .details(recortar(cambio.details()))
                    .occurredAt(LocalDateTime.now())
                    .build());
        } catch (Exception e) {
            log.error("No se pudo anotar en auditoria el cambio {} sobre {} {}: {}",
                    cambio.action(), cambio.entityType(), cambio.entityId(), e.getMessage(), e);
        }
    }

    /**
     * El detalle cabe en la columna o se corta aqui.
     *
     * Sin esto, un detalle largo lanzaria al guardar y se perderia la linea
     * ENTERA; recortado se pierde el final del texto y se conserva quien,
     * que y cuando, que es lo que se consulta.
     */
    private static String recortar(String detalle) {
        if (detalle == null) return null;
        return detalle.length() <= 1000 ? detalle : detalle.substring(0, 997) + "...";
    }
}
