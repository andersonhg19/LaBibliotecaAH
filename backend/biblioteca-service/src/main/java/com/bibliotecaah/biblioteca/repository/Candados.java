package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Candado de PostgreSQL por (que, usuario, ejemplar), soltado al terminar la
 * transaccion (pg_advisory_xact_lock).
 *
 * Para la deduplicacion de envios dobles (QA BI-10): dos "Anotar en el diario"
 * simultaneos del mismo usuario en el mismo libro se ponen en fila; el segundo
 * entra cuando el primero ya confirmo y ve su comentario, en vez de crear otro.
 * Peticiones de libros o usuarios distintos no se esperan entre si.
 */
@Component
public class Candados {

    private final JdbcTemplate jdbc;

    public Candados(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Debe llamarse dentro de una transaccion. */
    public void tomar(String que, Long usuarioId, UUID ejemplarId) {
        long clave = (que + ":" + usuarioId + ":" + ejemplarId).hashCode() * 31L + ejemplarId.getLeastSignificantBits();
        jdbc.query("SELECT pg_advisory_xact_lock(?)", rs -> null, clave);
    }
}
