package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.entity.AuditLog;

/**
 * El evento que se publica cuando pasa algo que hay que dejar anotado.
 *
 * LLEVA LOS DATOS DENTRO, EXPLICITOS. La alternativa —mandar la entidad y que
 * el que escucha saque de ella el actor, el id y el tipo con reflexion— es lo
 * que hace el publicador de auditoria de dropshipping: cuatro Method.invoke
 * dentro de bloques que devuelven null en silencio. Con eso, renombrar un
 * campo no rompe la compilacion: APAGA LA AUDITORIA SIN AVISAR, que es
 * exactamente el fallo que una auditoria no se puede permitir.
 *
 * Aqui, si falta un dato, no compila.
 */
public record CambioAuditable(
        Long actorUserId,
        String actorEmail,
        String entityType,
        Long entityId,
        AuditLog.Accion action,
        String details
) {
}
