package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public class PronunciacionRepositoryImpl implements PronunciacionRepository {

    private final JdbcTemplate jdbc;

    public PronunciacionRepositoryImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<PronunciacionEntradaDTO> deArchivo(UUID archivoId) {
        return jdbc.query("SELECT de, a FROM bah_lib_pronunciacion WHERE archivo_id = ? ORDER BY lower(de), de",
                (rs, n) -> new PronunciacionEntradaDTO(rs.getString(1), rs.getString(2)), archivoId);
    }

    @Override
    public void reemplazar(UUID archivoId, List<PronunciacionEntradaDTO> entradas, Long usuarioId) {
        jdbc.update("DELETE FROM bah_lib_pronunciacion WHERE archivo_id = ?", archivoId);
        if (entradas.isEmpty()) return;
        List<Object[]> filas = new ArrayList<>();
        for (PronunciacionEntradaDTO e : entradas) filas.add(new Object[]{archivoId, e.getDe(), e.getA(), usuarioId});
        jdbc.batchUpdate("INSERT INTO bah_lib_pronunciacion (archivo_id, de, a, usuario_id) VALUES (?, ?, ?, ?)", filas);
    }
}
