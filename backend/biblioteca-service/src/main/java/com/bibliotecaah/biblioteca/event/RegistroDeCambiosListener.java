package com.bibliotecaah.biblioteca.event;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Escribe cada EntityChangeEvent en bah_lib_cambio DESPUES del commit y en otro
 * hilo: solo se anota lo que de verdad se guardo y quien pidio la operacion no
 * espera. Si la escritura falla, queda en el log y la operacion sigue hecha.
 */
@Slf4j
@Component
public class RegistroDeCambiosListener {

    static final int LARGO_DETALLE = 1000;

    private final JdbcTemplate jdbc;

    public RegistroDeCambiosListener(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Async("ejecutorDeCambios")
    @TransactionalEventListener(fallbackExecution = true)
    public void registrar(EntityChangeEvent e) {
        try {
            String detalle = e.detalle() == null || e.detalle().length() <= LARGO_DETALLE
                    ? e.detalle() : e.detalle().substring(0, LARGO_DETALLE);
            jdbc.update("INSERT INTO bah_lib_cambio (entidad, entidad_id, accion, usuario_id, detalle) "
                    + "VALUES (?, ?, ?, ?, ?)", e.entidad(), e.entidadId(), e.accion().name(), e.usuarioId(), detalle);
        } catch (RuntimeException ex) {
            log.error("No se pudo registrar el cambio {} {} {}: {}",
                    e.accion(), e.entidad(), e.entidadId(), ex.getMessage());
        }
    }
}
