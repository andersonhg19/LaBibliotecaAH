package com.bibliotecaah.biblioteca.repository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Slf4j
@Repository
public class TrabajoRepositoryImpl implements TrabajoRepository {

    /** Hace MINUTOS_SIN_LATIDO minutos, en SQL. */
    private static final String HACE_UN_RATO = "now() - interval '" + MINUTOS_SIN_LATIDO + " minutes'";

    private final JdbcTemplate jdbc;

    public TrabajoRepositoryImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public UUID encolarConversion(UUID archivoId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                + "VALUES (?, ?, ?, '{}'::jsonb, ?)", id, CONVERTIR, archivoId, PRIORIDAD_CONVERTIR);
        log.info("Encolada conversion {} del archivo {}", id, archivoId);
        return id;
    }

    @Override
    public boolean encolarVozSiFalta(UUID archivoId, String vozId, int capitulo, int prioridad) {
        /* Vivo = PENDIENTE, o EN_CURSO con latido en los ultimos 10 min. Un
           EN_CURSO o un GENERANDO sin latido es un trabajo que murio con el
           taller (QA DA-01): no cuenta y el capitulo se vuelve a encolar. Un
           ERROR tampoco se reencola solo (QA DA-02). */
        Integer vivos = jdbc.queryForObject("SELECT "
                        + "(SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = ? AND archivo_id = ? "
                        + "AND (estado = 'PENDIENTE' OR (estado = 'EN_CURSO' AND actualizado > " + HACE_UN_RATO + ")) "
                        + "AND payload->>'vozId' = ? AND (payload->>'capitulo')::int = ?) + "
                        + "(SELECT COUNT(*) FROM bah_lib_audio WHERE archivo_id = ? AND voz_id = ? AND capitulo = ? "
                        + "AND (estado IN ('LISTO', 'ERROR') OR (estado = 'GENERANDO' AND actualizado > " + HACE_UN_RATO + ")))",
                Integer.class, VOZ_CAPITULO, archivoId, vozId, capitulo, archivoId, vozId, capitulo);
        if (vivos != null && vivos > 0) return false;
        /* (B17) el payload lleva el diccionario de pronunciacion del libro, si tiene */
        jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                        + "VALUES (?, ?, ?, jsonb_build_object('vozId', ?::text, 'capitulo', ?::int) || "
                        + PRONUNCIACION_DEL_ARCHIVO + ", ?)",
                UUID.randomUUID(), VOZ_CAPITULO, archivoId, vozId, capitulo, archivoId, prioridad);
        log.info("Encolada voz {} capitulo {} del archivo {} (prioridad {})", vozId, capitulo, archivoId, prioridad);
        return true;
    }

    @Override
    public void reintentarVoz(UUID archivoId, String vozId, int capitulo, int prioridad) {
        int filas = jdbc.update("UPDATE bah_lib_audio SET estado = 'PENDIENTE', error = NULL, actualizado = now() "
                + "WHERE archivo_id = ? AND voz_id = ? AND capitulo = ? AND estado = 'ERROR'", archivoId, vozId, capitulo);
        log.info("Reintento pedido de la voz {} capitulo {} del archivo {} ({} fila en ERROR)", vozId, capitulo,
                archivoId, filas);
        encolarVozSiFalta(archivoId, vozId, capitulo, prioridad);
    }

    @Override
    public int priorizarVoz(UUID archivoId, String vozId, int capitulo) {
        String deEseLibro = "WHERE tipo = ? AND estado = 'PENDIENTE' AND archivo_id = ? AND payload->>'vozId' = ? ";
        int subidos = jdbc.update("UPDATE bah_lib_trabajo SET prioridad = ? " + deEseLibro
                        + "AND (payload->>'capitulo')::int = ? AND prioridad > ?",
                PRIORIDAD_CAPITULO_PEDIDO, VOZ_CAPITULO, archivoId, vozId, capitulo, PRIORIDAD_CAPITULO_PEDIDO);
        int bajados = jdbc.update("UPDATE bah_lib_trabajo SET prioridad = ? " + deEseLibro
                        + "AND (payload->>'capitulo')::int <> ? AND prioridad < ?",
                PRIORIDAD_CAPITULO_SIGUIENTE, VOZ_CAPITULO, archivoId, vozId, capitulo, PRIORIDAD_CAPITULO_SIGUIENTE);
        if (subidos + bajados > 0) {
            log.info("Voz {} capitulo {} del archivo {}: {} trabajo(s) adelantado(s), {} atrasado(s)", vozId,
                    capitulo, archivoId, subidos, bajados);
        }
        return subidos + bajados;
    }

    @Override
    public Map<String, Object> estadoDelAudio(UUID archivoId, String vozId, int capitulo) {
        List<Map<String, Object>> filas = jdbc.queryForList(
                "SELECT estado, duracion_seg, error FROM bah_lib_audio WHERE archivo_id = ? AND voz_id = ? AND capitulo = ?",
                archivoId, vozId, capitulo);
        return filas.isEmpty() ? null : filas.get(0);
    }

    @Override
    public void olvidarArchivo(UUID archivoId) {
        jdbc.update("DELETE FROM bah_lib_trabajo WHERE archivo_id = ?", archivoId);
        jdbc.update("DELETE FROM bah_lib_audio WHERE archivo_id = ?", archivoId);
    }

    @Override
    public String metadatosDe(UUID archivoId) {
        List<String> filas = jdbc.queryForList(
                "SELECT metadatos::text FROM bah_lib_archivo WHERE id = ?", String.class, archivoId);
        return filas.isEmpty() ? null : filas.get(0);
    }

    @Override
    public int encolarRelecturaDeMaterias() {
        int n = jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                + "SELECT gen_random_uuid(), ?, a.id, '{}'::jsonb, ? FROM bah_lib_archivo a "
                + "WHERE a.estado_conversion = 'LISTO' AND a.metadatos -> 'materias' IS NULL "
                + "AND EXISTS (SELECT 1 FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id "
                + "WHERE e.archivo_id = a.id AND cardinality(o.generos) = 0) "
                + "AND NOT EXISTS (SELECT 1 FROM bah_lib_trabajo t WHERE t.archivo_id = a.id AND t.tipo = ? "
                + "AND t.estado IN ('PENDIENTE', 'EN_CURSO'))",
                RELEER_METADATOS, PRIORIDAD_RELEER, RELEER_METADATOS);
        log.info("Encolada la relectura de materias de {} archivo(s)", n);
        return n;
    }

    @Override
    public int contarObrasSinGenero() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id "
                + "WHERE e.archivo_id IS NOT NULL AND cardinality(o.generos) = 0", Integer.class);
        return Objects.requireNonNullElse(n, 0);
    }

    // ------------------------------------------------------------------ 0.4.0

    /** Trabajo de voz vivo: PENDIENTE, o EN_CURSO con latido reciente. */
    private static final String VIVO = "(estado = 'PENDIENTE' OR (estado = 'EN_CURSO' AND actualizado > " + HACE_UN_RATO + "))";

    @Override
    public List<UUID> archivosListos() {
        return jdbc.queryForList("SELECT id FROM bah_lib_archivo WHERE estado_conversion = 'LISTO' ORDER BY id",
                UUID.class);
    }

    @Override
    public boolean encolarReclasificacionSiFalta(UUID archivoId) {
        int n = jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                        + "SELECT ?, ?, ?, '{}'::jsonb, ? WHERE NOT EXISTS (SELECT 1 FROM bah_lib_trabajo t "
                        + "WHERE t.archivo_id = ? AND t.tipo = ? AND t.estado IN ('PENDIENTE', 'EN_CURSO'))",
                UUID.randomUUID(), RECLASIFICAR_ESTRUCTURA, archivoId, PRIORIDAD_RECLASIFICAR, archivoId,
                RECLASIFICAR_ESTRUCTURA);
        return n > 0;
    }

    @Override
    public Map<Integer, String> estadosDeVoz(UUID archivoId, String vozId) {
        Map<Integer, String> estados = new java.util.HashMap<>();
        jdbc.query("SELECT capitulo, estado FROM bah_lib_audio WHERE archivo_id = ? AND voz_id = ?",
                rs -> {
                    estados.put(rs.getInt(1), rs.getString(2));
                }, archivoId, vozId);
        return estados;
    }

    @Override
    public java.util.Set<Integer> capitulosEnCola(UUID archivoId, String vozId) {
        return new java.util.HashSet<>(jdbc.queryForList("SELECT DISTINCT (payload->>'capitulo')::int FROM bah_lib_trabajo "
                        + "WHERE tipo = ? AND archivo_id = ? AND payload->>'vozId' = ? AND " + VIVO,
                Integer.class, VOZ_CAPITULO, archivoId, vozId));
    }

    @Override
    public int colaDeVoz() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = ? AND " + VIVO,
                Integer.class, VOZ_CAPITULO);
        return Objects.requireNonNullElse(n, 0);
    }

    @Override
    public boolean vozUrgenteAtascada(int minutos) {
        Boolean atascada = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM bah_lib_trabajo WHERE tipo = ? "
                        + "AND estado = 'PENDIENTE' AND prioridad <= ? AND creado < now() - make_interval(mins => ?))",
                Boolean.class, VOZ_CAPITULO, PRIORIDAD_CAPITULO_PEDIDO, minutos);
        return Boolean.TRUE.equals(atascada);
    }

    // ------------------------------------------------------------------ B17

    @Override
    public List<Map<String, Object>> audiosListos(UUID archivoId) {
        return jdbc.queryForList("SELECT voz_id, capitulo FROM bah_lib_audio WHERE archivo_id = ? AND estado = 'LISTO' "
                + "ORDER BY capitulo, voz_id", archivoId);
    }

    @Override
    public List<Map<String, Object>> vozEnCurso(UUID archivoId) {
        return jdbc.queryForList("SELECT DISTINCT payload->>'vozId' AS voz_id, (payload->>'capitulo')::int AS capitulo "
                + "FROM bah_lib_trabajo WHERE tipo = ? AND archivo_id = ? AND estado = 'EN_CURSO' "
                + "AND actualizado > " + HACE_UN_RATO, VOZ_CAPITULO, archivoId);
    }

    @Override
    public int actualizarPronunciacionEnCola(UUID archivoId) {
        return jdbc.update("UPDATE bah_lib_trabajo SET payload = (payload - 'pronunciacion') || "
                + PRONUNCIACION_DEL_ARCHIVO + " WHERE tipo = ? AND archivo_id = ? AND estado = 'PENDIENTE'",
                archivoId, VOZ_CAPITULO, archivoId);
    }

    @Override
    public boolean encolarRegeneracion(UUID archivoId, String vozId, int capitulo) {
        int n = jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                        + "SELECT ?, ?, ?, jsonb_build_object('vozId', ?::text, 'capitulo', ?::int, 'regenerar', true) || "
                        + PRONUNCIACION_DEL_ARCHIVO + ", ? WHERE NOT EXISTS (SELECT 1 FROM bah_lib_trabajo t "
                        + "WHERE t.tipo = ? AND t.archivo_id = ? AND t.estado = 'PENDIENTE' "
                        + "AND t.payload->>'vozId' = ? AND (t.payload->>'capitulo')::int = ?)",
                UUID.randomUUID(), VOZ_CAPITULO, archivoId, vozId, capitulo, archivoId, PRIORIDAD_REGENERAR,
                VOZ_CAPITULO, archivoId, vozId, capitulo);
        if (n > 0) log.info("Encolada la regeneracion de la voz {} capitulo {} del archivo {}", vozId, capitulo, archivoId);
        return n > 0;
    }

    @Override
    public int regenerando(UUID archivoId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = ? AND archivo_id = ? "
                + "AND payload->>'regenerar' = 'true' AND " + VIVO, Integer.class, VOZ_CAPITULO, archivoId);
        return Objects.requireNonNullElse(n, 0);
    }
}
