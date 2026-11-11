package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Progreso;
import com.bibliotecaah.biblioteca.mapper.BibliotecaMapper;
import com.bibliotecaah.biblioteca.repository.AnotacionRepository;
import com.bibliotecaah.biblioteca.repository.EstanteItemRepository;
import com.bibliotecaah.biblioteca.repository.ProgresoRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Ejemplares -> EjemplarDTO. Lo que no vive en el ejemplar (favorito,
 * porcentaje, numero de notas) se pide en UNA consulta por pagina, no una por libro.
 */
@Component
public class EnsambladorDeEjemplares {

    private final EstanteItemRepository items;
    private final ProgresoRepository progresos;
    private final AnotacionRepository anotaciones;
    private final BibliotecaMapper mapper;

    public EnsambladorDeEjemplares(EstanteItemRepository items, ProgresoRepository progresos,
                                   AnotacionRepository anotaciones, BibliotecaMapper mapper) {
        this.items = items;
        this.progresos = progresos;
        this.anotaciones = anotaciones;
        this.mapper = mapper;
    }

    public List<EjemplarDTO> ensamblar(Long usuarioId, List<Ejemplar> ejemplares) {
        List<EjemplarDTO> lista = new ArrayList<>();
        if (ejemplares.isEmpty()) return lista;
        List<UUID> ids = ejemplares.stream().map(Ejemplar::getId).toList();
        Extras extras = extras(usuarioId, ids);
        for (Ejemplar e : ejemplares) {
            EjemplarDTO dto = mapper.aEjemplarDTO(e);
            extras.completar(dto);
            lista.add(dto);
        }
        return lista;
    }

    public EjemplarDTO uno(Long usuarioId, Ejemplar e) {
        return ensamblar(usuarioId, List.of(e)).get(0);
    }

    /** Lo que se calcula fuera del ejemplar, para los ids dados. */
    public Extras extras(Long usuarioId, List<UUID> ids) {
        Set<UUID> favoritos = new HashSet<>(items.favoritosEntre(usuarioId, ids));
        Map<UUID, Double> porcentajes = new HashMap<>();
        for (Progreso p : progresos.findByUsuarioIdAndEjemplarIdIn(usuarioId, ids)) {
            porcentajes.put(p.getEjemplarId(), p.getPorcentaje());
        }
        Map<UUID, Long> notas = new HashMap<>();
        for (Object[] fila : anotaciones.contarPorEjemplar(usuarioId, ids)) {
            notas.put((UUID) fila[0], ((Number) fila[1]).longValue());
        }
        return new Extras(favoritos, porcentajes, notas);
    }

    public record Extras(Set<UUID> favoritos, Map<UUID, Double> porcentajes, Map<UUID, Long> notas) {
        public void completar(EjemplarDTO dto) {
            dto.setFavorito(favoritos.contains(dto.getId()));
            dto.setPorcentaje(porcentajes.getOrDefault(dto.getId(), 0.0));
            dto.setNNotas(notas.getOrDefault(dto.getId(), 0L));
        }
    }
}
