package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class TraduccionRepositoryImpl implements TraduccionRepository {

    private final JdbcTemplate jdbc;

    public TraduccionRepositoryImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Guardada> buscar(String hash) {
        List<Guardada> filas = jdbc.query("UPDATE bah_lib_traduccion SET usado = now() WHERE hash = ? "
                        + "RETURNING traduccion, origen_detectado",
                (rs, i) -> new Guardada(rs.getString("traduccion"), rs.getString("origen_detectado")), hash);
        return filas.stream().findFirst();
    }

    @Override
    public void guardar(String hash, String origen, String destino, String traduccion, String origenDetectado) {
        jdbc.update("INSERT INTO bah_lib_traduccion (hash, origen, destino, traduccion, origen_detectado) "
                + "VALUES (?, ?, ?, ?, ?) ON CONFLICT (hash) DO NOTHING",
                hash, origen, destino, traduccion, origenDetectado);
    }

    @Override
    public int purgar(int dias) {
        return jdbc.update("DELETE FROM bah_lib_traduccion WHERE usado < now() - make_interval(days => ?)", dias);
    }
}
