package com.bibliotecaah.biblioteca.repository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Repository
public class TrabajoRepositoryImpl implements TrabajoRepository {

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
        Integer vivos = jdbc.queryForObject("SELECT "
                        + "(SELECT COUNT(*) FROM bah_lib_trabajo WHERE tipo = ? AND archivo_id = ? "
                        + "AND estado IN ('PENDIENTE', 'EN_CURSO') AND payload->>'vozId' = ? "
                        + "AND (payload->>'capitulo')::int = ?) + "
                        + "(SELECT COUNT(*) FROM bah_lib_audio WHERE archivo_id = ? AND voz_id = ? AND capitulo = ? "
                        + "AND estado IN ('LISTO', 'GENERANDO'))",
                Integer.class, VOZ_CAPITULO, archivoId, vozId, capitulo, archivoId, vozId, capitulo);
        if (vivos != null && vivos > 0) return false;
        jdbc.update("INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad) "
                        + "VALUES (?, ?, ?, jsonb_build_object('vozId', ?::text, 'capitulo', ?::int), ?)",
                UUID.randomUUID(), VOZ_CAPITULO, archivoId, vozId, capitulo, prioridad);
        log.info("Encolada voz {} capitulo {} del archivo {} (prioridad {})", vozId, capitulo, archivoId, prioridad);
        return true;
    }

    @Override
    public Map<String, Object> estadoDelAudio(UUID archivoId, String vozId, int capitulo) {
        List<Map<String, Object>> filas = jdbc.queryForList(
                "SELECT estado, duracion_seg FROM bah_lib_audio WHERE archivo_id = ? AND voz_id = ? AND capitulo = ?",
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
}
