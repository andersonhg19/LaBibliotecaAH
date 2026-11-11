package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.ComentarioDTO;
import com.bibliotecaah.biblioteca.entity.Comentario;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.mapper.BibliotecaMapper;
import com.bibliotecaah.biblioteca.repository.ComentarioRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.service.ComentarioService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Diario de lectura de cada libro. */
@Service
@Transactional
public class ComentarioServiceImpl implements ComentarioService {

    private final ComentarioRepository comentarios;
    private final EjemplarRepository ejemplares;
    private final BibliotecaMapper mapper;
    private final ApplicationEventPublisher eventos;

    public ComentarioServiceImpl(ComentarioRepository comentarios, EjemplarRepository ejemplares,
                                 BibliotecaMapper mapper, ApplicationEventPublisher eventos) {
        this.comentarios = comentarios;
        this.ejemplares = ejemplares;
        this.mapper = mapper;
        this.eventos = eventos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComentarioDTO> getAll(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        ejemplarPropio(yo, ejemplarId);
        return comentarios.findByUsuarioIdAndEjemplarIdOrderByCreationAsc(yo, ejemplarId).stream()
                .map(mapper::aComentarioDTO).toList();
    }

    @Override
    public ComentarioDTO saveAndUpdate(ComentarioDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        ejemplarPropio(yo, dto.getEjemplarId());
        Comentario c;
        EntityChangeEvent.Accion accion;
        if (dto.getId() == null) {
            c = Comentario.builder().id(UUID.randomUUID()).usuarioId(yo).ejemplarId(dto.getEjemplarId()).build();
            accion = EntityChangeEvent.Accion.CREAR;
        } else {
            c = ValidationUtils.encontrado(comentarios.findByIdAndUsuarioId(dto.getId(), yo),
                    Message.Msj.comentarioNoEncontrado);
            ValidationUtils.exigir(c.getEjemplarId().equals(dto.getEjemplarId()),
                    Message.Msj.comentarioNoEncontrado, CodigoError.NO_ENCONTRADO);
            accion = EntityChangeEvent.Accion.ACTUALIZAR;
        }
        c.setTexto(dto.getTexto().trim());
        Comentario guardado = comentarios.save(c);
        eventos.publishEvent(new EntityChangeEvent("Comentario", c.getId().toString(), accion, yo, null));
        return mapper.aComentarioDTO(guardado);
    }

    @Override
    public boolean delete(UUID id) {
        Long yo = SecurityUtils.usuarioActual();
        Comentario c = ValidationUtils.encontrado(comentarios.findByIdAndUsuarioId(id, yo),
                Message.Msj.comentarioNoEncontrado);
        comentarios.delete(c);
        eventos.publishEvent(new EntityChangeEvent("Comentario", id.toString(), EntityChangeEvent.Accion.BORRAR, yo, null));
        return true;
    }

    private void ejemplarPropio(Long yo, UUID ejemplarId) {
        ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
    }
}
