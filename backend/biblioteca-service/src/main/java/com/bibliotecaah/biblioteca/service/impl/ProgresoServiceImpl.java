package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.ProgresoDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Progreso;
import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.ModoLectura;
import com.bibliotecaah.biblioteca.mapper.BibliotecaMapper;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.ProgresoRepository;
import com.bibliotecaah.biblioteca.service.ProgresoService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Donde va cada quien. Gana el actualizadoEn MAS RECIENTE (lo pone el
 * dispositivo): si el iPhone manda tarde un progreso viejo, no pisa lo que el PC
 * guardo despues. Al guardar se marca la ultima apertura y un POR_LEER pasa a
 * LEYENDO. No se registra en la tabla de cambios: llega cada pocos segundos.
 */
@Service
@Transactional
public class ProgresoServiceImpl implements ProgresoService {

    private final ProgresoRepository progresos;
    private final EjemplarRepository ejemplares;
    private final BibliotecaMapper mapper;
    private final Mensajes mensajes;

    public ProgresoServiceImpl(ProgresoRepository progresos, EjemplarRepository ejemplares,
                               BibliotecaMapper mapper, Mensajes mensajes) {
        this.progresos = progresos;
        this.ejemplares = ejemplares;
        this.mapper = mapper;
        this.mensajes = mensajes;
    }

    @Override
    @Transactional(readOnly = true)
    public ProgresoDTO getById(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        propio(yo, ejemplarId);
        return progresos.findByUsuarioIdAndEjemplarId(yo, ejemplarId).map(mapper::aProgresoDTO).orElse(null);
    }

    @Override
    public ResultDTO saveAndUpdate(ProgresoDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar ejemplar = propio(yo, dto.getEjemplarId());
        Instant cuando = dto.getActualizadoEn() == null ? Instant.now() : dto.getActualizadoEn();

        Progreso p = progresos.findByUsuarioIdAndEjemplarId(yo, ejemplar.getId()).orElse(null);
        if (p != null && p.getActualizadoEn().isAfter(cuando)) {
            return new ResultDTO(true, mensajes.texto(Message.Msj.progresoMasReciente), CodigoError.OK,
                    mapper.aProgresoDTO(p));
        }
        if (p == null) {
            p = Progreso.builder().id(UUID.randomUUID()).usuarioId(yo).ejemplarId(ejemplar.getId()).build();
        }
        mapper.copiarProgreso(dto, p);
        p.setActualizadoEn(cuando);
        if (p.getCapitulo() == null) p.setCapitulo(0);
        if (p.getPorcentaje() == null) p.setPorcentaje(0.0);
        p.setPorcentaje(Math.max(0.0, Math.min(100.0, p.getPorcentaje())));
        if (p.getModo() == null) p.setModo(ModoLectura.VISTA);
        progresos.save(p);

        ejemplar.setUltimaApertura(Instant.now());
        if (ejemplar.getEstado() == EstadoLectura.POR_LEER) {
            LibroServiceImpl.cambiarEstado(ejemplar, EstadoLectura.LEYENDO);
        }
        ejemplares.save(ejemplar);
        return new ResultDTO(mapper.aProgresoDTO(p));
    }

    private Ejemplar propio(Long yo, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
    }
}
