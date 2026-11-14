package com.bibliotecaah.biblioteca.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class CapituloVozRepositoryImpl implements CapituloVozRepository {

    private final JdbcTemplate jdbc;

    public CapituloVozRepositoryImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Integer, Boolean> deEjemplar(Long usuarioId, UUID ejemplarId) {
        Map<Integer, Boolean> prefs = new LinkedHashMap<>();
        jdbc.query("SELECT indice, en_voz FROM bah_lib_capitulo_voz WHERE usuario_id = ? AND ejemplar_id = ? "
                        + "ORDER BY indice",
                rs -> {
                    prefs.put(rs.getInt(1), rs.getBoolean(2));
                }, usuarioId, ejemplarId);
        return prefs;
    }

    @Override
    public void guardar(Long usuarioId, UUID ejemplarId, int indice, Boolean enVoz) {
        if (enVoz == null) {
            jdbc.update("DELETE FROM bah_lib_capitulo_voz WHERE usuario_id = ? AND ejemplar_id = ? AND indice = ?",
                    usuarioId, ejemplarId, indice);
            return;
        }
        jdbc.update("INSERT INTO bah_lib_capitulo_voz (usuario_id, ejemplar_id, indice, en_voz) VALUES (?, ?, ?, ?) "
                        + "ON CONFLICT (usuario_id, ejemplar_id, indice) "
                        + "DO UPDATE SET en_voz = EXCLUDED.en_voz, last_update = now()",
                usuarioId, ejemplarId, indice, enVoz);
    }

    @Override
    public void reemplazar(Long usuarioId, UUID ejemplarId, Map<Integer, Boolean> preferencias) {
        jdbc.update("DELETE FROM bah_lib_capitulo_voz WHERE usuario_id = ? AND ejemplar_id = ?", usuarioId, ejemplarId);
        if (preferencias.isEmpty()) return;
        List<Object[]> filas = new ArrayList<>();
        preferencias.forEach((indice, enVoz) -> filas.add(new Object[]{usuarioId, ejemplarId, indice, enVoz}));
        jdbc.batchUpdate("INSERT INTO bah_lib_capitulo_voz (usuario_id, ejemplar_id, indice, en_voz) VALUES (?, ?, ?, ?)",
                filas);
    }
}
