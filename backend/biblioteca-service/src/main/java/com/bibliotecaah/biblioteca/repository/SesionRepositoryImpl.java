package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Repository
public class SesionRepositoryImpl implements SesionRepository {

    /** Segundos de mas que se aceptan sobre el tiempo real entre dos latidos (red lenta, relojes). */
    static final int MARGEN_SEGUNDOS = 10;

    private final NamedParameterJdbcTemplate jdbc;
    private final Candados candados;

    public SesionRepositoryImpl(NamedParameterJdbcTemplate jdbc, Candados candados) {
        this.jdbc = jdbc;
        this.candados = candados;
    }

    /**
     * Validacion 0.4.0 (V-NUEVO-4): el tope "tiempo real + margen" se aplicaba solo al alargar la
     * MISMA sesion; 30 latidos de 120 s sin sesionId en 100 ms sumaban 60 minutos, y dos pestanas
     * o dispositivos a la vez sumaban doble. Ahora el tope es por USUARIO:
     * <ul>
     *   <li>los latidos del usuario entran de uno en uno (candado de PostgreSQL por usuario hasta el
     *       fin de la transaccion), asi que el siguiente ve lo que confirmo el anterior;</li>
     *   <li>lo que suma un latido (cree o alargue) no pasa del tiempo real desde el ultimo {@code fin}
     *       de CUALQUIER sesion del usuario + el margen;</li>
     *   <li>ese {@code fin} avanza hasta lo ya contado ({@code max(ahora, ultimoFin + contado)}): el
     *       margen no se acumula latido a latido, y la suma de todas las sesiones del usuario nunca
     *       pasa del tiempo real + un margen. {@code fin} puede quedar hasta 10 s por delante del
     *       reloj; nada lo usa como hora real (el resumen va por {@code inicio}).</li>
     * </ul>
     * Con un solo dispositivo nada cambia: un latido de 60 s cada 60 s suma 60 s.
     */
    @Override
    public Integer latido(Latido l) {
        candados.tomarDelUsuario("sesion", l.usuarioId());
        Timestamp ultimo = jdbc.queryForObject("SELECT max(fin) FROM bah_lib_sesion WHERE usuario_id = :u",
                new MapSqlParameterSource("u", l.usuarioId()), Timestamp.class);
        Instant ultimoFin = ultimo == null ? null : ultimo.toInstant();
        int contado = contable(l.segundos(), ultimoFin, l.ahora());
        Instant fin = ultimoFin == null || l.ahora().isAfter(ultimoFin.plusSeconds(contado))
                ? l.ahora() : ultimoFin.plusSeconds(contado);
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("id", l.sesionId())
                .addValue("u", l.usuarioId())
                .addValue("e", l.ejemplarId())
                .addValue("modo", l.modo())
                .addValue("inicio", Timestamp.from(fin.minusSeconds(contado)))
                .addValue("fin", Timestamp.from(fin))
                .addValue("seg", contado)
                .addValue("cap", l.capitulo())
                .addValue("pos", l.posicion())
                .addValue("disp", l.dispositivo());
        List<Integer> total = jdbc.queryForList("INSERT INTO bah_lib_sesion AS s (id, usuario_id, ejemplar_id, modo, "
                + "inicio, fin, segundos, capitulo_inicio, capitulo_fin, posicion_fin, dispositivo) "
                + "VALUES (:id, :u, :e, :modo, :inicio, :fin, :seg, :cap, :cap, :pos, :disp) "
                + "ON CONFLICT (id) DO UPDATE SET "
                + "segundos = s.segundos + EXCLUDED.segundos, "
                + "fin = GREATEST(s.fin, EXCLUDED.fin), "
                + "capitulo_fin = COALESCE(EXCLUDED.capitulo_fin, s.capitulo_fin), "
                + "posicion_fin = COALESCE(EXCLUDED.posicion_fin, s.posicion_fin), "
                + "dispositivo = COALESCE(EXCLUDED.dispositivo, s.dispositivo), "
                + "last_update = now() "
                + "WHERE s.usuario_id = EXCLUDED.usuario_id AND s.ejemplar_id = EXCLUDED.ejemplar_id "
                + "RETURNING s.segundos", p, Integer.class);
        return total.isEmpty() ? null : total.get(0);
    }

    /**
     * Segundos que cuenta un latido: los pedidos, sin pasar del tiempo real desde el ultimo fin del
     * usuario (redondeado hacia arriba) + el margen; nunca negativos. Sin sesiones previas, los pedidos
     * (ya validados: 0..120).
     */
    static int contable(int pedidos, Instant ultimoFin, Instant ahora) {
        if (ultimoFin == null) return pedidos;
        long transcurridos = (long) Math.ceil(Duration.between(ultimoFin, ahora).toMillis() / 1000.0);
        return (int) Math.min(pedidos, Math.max(0, transcurridos + MARGEN_SEGUNDOS));
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
