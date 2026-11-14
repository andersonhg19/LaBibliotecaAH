package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.ReclasificacionDTO;
import com.bibliotecaah.biblioteca.dto.output.RellenoGenerosDTO;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.MantenimientoService;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

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
    private final LectorDeEstructura estructura;
    private final AlmacenDeArchivos almacen;

    public MantenimientoServiceImpl(TrabajoRepository trabajos, LectorDeEstructura estructura,
                                    AlmacenDeArchivos almacen) {
        this.trabajos = trabajos;
        this.estructura = estructura;
        this.almacen = almacen;
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

    /**
     * Mira la version de estructura.json de cada archivo LISTO: los v1 se encolan
     * (si no tienen ya un RECLASIFICAR_ESTRUCTURA vivo), los v2 se dejan. Sin el
     * disco no se puede saber que version tienen: 503 datosNoDisponibles.
     */
    @Override
    @Transactional
    public ReclasificacionDTO reclasificarEstructura() {
        Long yo = SecurityUtils.usuarioActual();
        almacen.exigirDisponible();
        ReclasificacionDTO dto = new ReclasificacionDTO();
        for (UUID archivo : trabajos.archivosListos()) {
            int version = estructura.version(archivo);
            if (version == LectorDeEstructura.SIN_ESTRUCTURA) {
                dto.setSinEstructura(dto.getSinEstructura() + 1);
            } else if (version >= 2) {
                dto.setYaReclasificados(dto.getYaReclasificados() + 1);
            } else if (trabajos.encolarReclasificacionSiFalta(archivo)) {
                dto.setArchivosEncolados(dto.getArchivosEncolados() + 1);
            } else {
                dto.setYaEnCola(dto.getYaEnCola() + 1);
            }
        }
        log.info("Reclasificacion de estructuras pedida por el usuario {}: {} encolado(s), {} ya en v2, {} ya en cola, "
                + "{} sin estructura", yo, dto.getArchivosEncolados(), dto.getYaReclasificados(), dto.getYaEnCola(),
                dto.getSinEstructura());
        return dto;
    }
}
