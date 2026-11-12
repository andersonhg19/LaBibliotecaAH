package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.RellenoGenerosDTO;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.MantenimientoService;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El relleno solo encola: el taller relee las materias de cada original
 * (RELEER_METADATOS), las anade a los metadatos del archivo y lo marca para
 * que {@link TareaMetadatos} rellene los generos vacios. Cuantos se rellenaron
 * queda en el log de esa tarea ("generos rellenados en N obra(s)").
 */
@Slf4j
@Service
public class MantenimientoServiceImpl implements MantenimientoService {

    private final TrabajoRepository trabajos;

    public MantenimientoServiceImpl(TrabajoRepository trabajos) {
        this.trabajos = trabajos;
    }

    @Override
    @Transactional
    public RellenoGenerosDTO rellenarGeneros() {
        Long yo = SecurityUtils.usuarioActual();
        int sinGenero = trabajos.contarObrasSinGenero();
        int encolados = trabajos.encolarRelecturaDeMaterias();
        log.info("Relleno de generos pedido por el usuario {}: {} obra(s) sin genero, {} archivo(s) encolados "
                + "para releer sus materias", yo, sinGenero, encolados);
        return new RellenoGenerosDTO(encolados, sinGenero);
    }
}
