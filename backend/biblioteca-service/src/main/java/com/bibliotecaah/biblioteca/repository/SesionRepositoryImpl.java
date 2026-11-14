package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;

@Repository
public class SesionRepositoryImpl implements SesionRepository {

    /** Segundos de mas que se aceptan sobre el tiempo real entre dos latidos (red lenta, relojes). */
    static final int MARGEN_SEGUNDOS = 10;

    private final NamedParameterJdbcTemplate jdbc;

    public SesionRepositoryImpl(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Integer latido(Latido l) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("id", l.sesionId())
                .addValue("u", l.usuarioId())
                .addValue("e", l.ejemplarId())
                .addValue("modo", l.modo())
                .addValue("inicio", Timestamp.from(l.ahora().minusSeconds(l.segundos())))
                .addValue("ahora", Timestamp.from(l.ahora()))
                .addValue("seg", l.segundos())
                .addValue("cap", l.capitulo())
                .addValue("pos", l.posicion())
                .addValue("disp", l.dispositivo())
                .addValue("margen", MARGEN_SEGUNDOS);
        List<Integer> total = jdbc.queryForList("INSERT INTO bah_lib_sesion AS s (id, usuario_id, ejemplar_id, modo, "
                + "inicio, fin, segundos, capitulo_inicio, capitulo_fin, posicion_fin, dispositivo) "
                + "VALUES (:id, :u, :e, :modo, :inicio, :ahora, :seg, :cap, :cap, :pos, :disp) "
                + "ON CONFLICT (id) DO UPDATE SET "
                + "segundos = s.segundos + LEAST(EXCLUDED.segundos, "
                + "  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (EXCLUDED.fin - s.fin))))::int + :margen), "
                + "fin = GREATEST(s.fin, EXCLUDED.fin), "
                + "capitulo_fin = COALESCE(EXCLUDED.capitulo_fin, s.capitulo_fin), "
                + "posicion_fin = COALESCE(EXCLUDED.posicion_fin, s.posicion_fin), "
                + "dispositivo = COALESCE(EXCLUDED.dispositivo, s.dispositivo), "
                + "last_update = now() "
                + "WHERE s.usuario_id = EXCLUDED.usuario_id AND s.ejemplar_id = EXCLUDED.ejemplar_id "
                + "RETURNING s.segundos", p, Integer.class);
        return total.isEmpty() ? null : total.get(0);
    }

    @Override
    public List<Fila> porDia(Long usuarioId, LocalDate desde, LocalDate hasta, String zona) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("u", usuarioId).addValue("zona", zona)
                .addValue("desde", desde).addValue("hasta", hasta);
        return jdbc.query("SELECT (s.inicio AT TIME ZONE :zona)::date AS dia, s.modo, s.ejemplar_id, o.titulo, "
                        + "SUM(s.segundos) AS segundos FROM bah_lib_sesion s "
                        + "JOIN bah_lib_ejemplar e ON e.id = s.ejemplar_id JOIN bah_lib_obra o ON o.id = e.obra_id "
                        + "WHERE s.usuario_id = :u AND (s.inicio AT TIME ZONE :zona)::date BETWEEN :desde AND :hasta "
                        + "GROUP BY 1, 2, 3, 4 ORDER BY 1",
                p, (rs, i) -> new Fila(rs.getObject("dia", LocalDate.class), rs.getString("modo"),
                        rs.getObject("ejemplar_id", java.util.UUID.class), rs.getString("titulo"),
                        rs.getLong("segundos")));
    }

    @Override
    public List<LocalDate> diasActivos(Long usuarioId, String zona, int minimoSegundos) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("u", usuarioId).addValue("zona", zona).addValue("minimo", minimoSegundos);
        return jdbc.query("SELECT (inicio AT TIME ZONE :zona)::date AS dia FROM bah_lib_sesion WHERE usuario_id = :u "
                        + "GROUP BY 1 HAVING SUM(segundos) >= :minimo ORDER BY 1",
                p, (rs, i) -> rs.getObject("dia", LocalDate.class));
    }
}
