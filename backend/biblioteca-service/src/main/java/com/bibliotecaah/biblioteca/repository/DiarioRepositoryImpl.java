package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Repository
public class DiarioRepositoryImpl implements DiarioRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public DiarioRepositoryImpl(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void guardar(List<Evento> eventos) {
        if (eventos.isEmpty()) return;
        MapSqlParameterSource[] filas = eventos.stream().map(e -> new MapSqlParameterSource()
                .addValue("id", UUID.randomUUID())
                .addValue("u", e.usuarioId())
                .addValue("ej", e.ejemplarId())
                .addValue("cuando", Timestamp.from(e.cuando()))
                .addValue("tipo", e.tipo())
                .addValue("cap", e.capitulo())
                .addValue("pos", e.posicion())
                .addValue("detalle", e.detalle())
                .addValue("ctx", e.contextoJson())).toArray(MapSqlParameterSource[]::new);
        jdbc.batchUpdate("INSERT INTO bah_lib_diario (id, usuario_id, ejemplar_id, cuando, tipo, capitulo, posicion, "
                + "detalle, contexto) VALUES (:id, :u, :ej, :cuando, :tipo, :cap, :pos, :detalle, CAST(:ctx AS jsonb))",
                filas);
    }

    @Override
    public Set<UUID> ejemplaresDelUsuario(Long usuarioId, Collection<UUID> ids) {
        if (ids.isEmpty()) return Set.of();
        return new HashSet<>(jdbc.queryForList("SELECT id FROM bah_lib_ejemplar WHERE usuario_id = :u AND id IN (:ids)",
                new MapSqlParameterSource("u", usuarioId).addValue("ids", ids), UUID.class));
    }

    @Override
    public int purgar(int dias) {
        return jdbc.update("DELETE FROM bah_lib_diario WHERE creado_en < now() - make_interval(days => :dias)",
                new MapSqlParameterSource("dias", dias));
    }
}
