package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.AnotacionDTO;
import com.bibliotecaah.biblioteca.entity.Anotacion;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.mapper.BibliotecaMapper;
import com.bibliotecaah.biblioteca.repository.AnotacionRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.service.AnotacionService;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import com.bibliotecaah.biblioteca.repository.Candados;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Resaltados, notas y marcadores. Nunca se borran al reprocesar un libro. */
@Service
@Transactional
public class AnotacionServiceImpl implements AnotacionService {

    private final AnotacionRepository anotaciones;
    private final EjemplarRepository ejemplares;
    private final BibliotecaMapper mapper;
    private final ApplicationEventPublisher eventos;
    private final Candados candados;

    public AnotacionServiceImpl(AnotacionRepository anotaciones, EjemplarRepository ejemplares,
                                BibliotecaMapper mapper, ApplicationEventPublisher eventos, Candados candados) {
        this.candados = candados;
        this.anotaciones = anotaciones;
        this.ejemplares = ejemplares;
        this.mapper = mapper;
        this.eventos = eventos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AnotacionDTO> getAll(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        ejemplarPropio(yo, ejemplarId);
        return anotaciones.findByUsuarioIdAndEjemplarIdOrderByCreationAsc(yo, ejemplarId).stream()
                .map(mapper::aAnotacionDTO).toList();
    }

    @Override
    public AnotacionDTO saveAndUpdate(AnotacionDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        ejemplarPropio(yo, dto.getEjemplarId());
        Anotacion a;
        EntityChangeEvent.Accion accion;
        if (dto.getId() == null) {
            /* QA BI-10: la misma anotacion enviada dos veces seguidas no se duplica. */
            candados.tomar("anotacion", yo, dto.getEjemplarId());
            Optional<Anotacion> igual = anotaciones.findByUsuarioIdAndEjemplarIdAndTipoAndCreationAfter(yo,
                            dto.getEjemplarId(), dto.getTipo(), Instant.now().minus(ComentarioServiceImpl.VENTANA_DUPLICADOS))
                    .stream().filter(x -> mismaAnotacion(x, dto)).findFirst();
            if (igual.isPresent()) {
                return mapper.aAnotacionDTO(igual.get());
            }
            a = Anotacion.builder().id(UUID.randomUUID()).usuarioId(yo).ejemplarId(dto.getEjemplarId()).build();
            accion = EntityChangeEvent.Accion.CREAR;
        } else {
            a = ValidationUtils.encontrado(anotaciones.findByIdAndUsuarioId(dto.getId(), yo),
                    Message.Msj.anotacionNoEncontrada);
            ValidationUtils.exigir(a.getEjemplarId().equals(dto.getEjemplarId()),
                    Message.Msj.anotacionNoEncontrada, 102);
            a.setEditado(Instant.now());
            accion = EntityChangeEvent.Accion.ACTUALIZAR;
        }
        mapper.copiarAnotacion(dto, a);
        Anotacion guardada = anotaciones.save(a);
        eventos.publishEvent(new EntityChangeEvent("Anotacion", a.getId().toString(), accion, yo, a.getTipo().name()));
        return mapper.aAnotacionDTO(guardada);
    }

    @Override
    public boolean delete(UUID id) {
        Long yo = SecurityUtils.usuarioActual();
        Anotacion a = ValidationUtils.encontrado(anotaciones.findByIdAndUsuarioId(id, yo), Message.Msj.anotacionNoEncontrada);
        anotaciones.delete(a);
        eventos.publishEvent(new EntityChangeEvent("Anotacion", id.toString(), EntityChangeEvent.Accion.BORRAR, yo, null));
        return true;
    }

    static boolean mismaAnotacion(Anotacion a, AnotacionDTO d) {
        return Objects.equals(a.getCfi(), d.getCfi()) && Objects.equals(a.getFraseInicio(), d.getFraseInicio())
                && Objects.equals(a.getOffsetInicio(), d.getOffsetInicio()) && Objects.equals(a.getFraseFin(), d.getFraseFin())
                && Objects.equals(a.getOffsetFin(), d.getOffsetFin()) && Objects.equals(a.getNota(), d.getNota())
                && Objects.equals(a.getColor(), d.getColor()) && Objects.equals(a.getCapitulo(), d.getCapitulo());
    }

    private void ejemplarPropio(Long yo, UUID ejemplarId) {
        ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
    }
}
