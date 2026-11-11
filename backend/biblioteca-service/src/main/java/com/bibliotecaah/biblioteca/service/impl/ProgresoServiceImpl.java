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

import org.springframework.beans.factory.annotation.Autowired;

import java.time.Clock;
import java.time.Duration;
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
    /** Cuanto puede adelantarse el reloj de un dispositivo (QA SE-13). */
    static final Duration TOLERANCIA = Duration.ofMinutes(2);

    private final Mensajes mensajes;
    private final Clock reloj;

    @Autowired
    public ProgresoServiceImpl(ProgresoRepository progresos, EjemplarRepository ejemplares,
                               BibliotecaMapper mapper, Mensajes mensajes) {
        this(progresos, ejemplares, mapper, mensajes, Clock.systemUTC());
    }

    ProgresoServiceImpl(ProgresoRepository progresos, EjemplarRepository ejemplares,
                        BibliotecaMapper mapper, Mensajes mensajes, Clock reloj) {
        this.reloj = reloj;
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
        validarNumeros(dto);
        Instant ahora = Instant.now(reloj);
        Instant cuando = momento(dto.getActualizadoEn(), ahora);

        Progreso p = progresos.findByUsuarioIdAndEjemplarId(yo, ejemplar.getId()).orElse(null);
        if (p != null && momento(p.getActualizadoEn(), ahora).isAfter(cuando)) {
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
        if (p.getModo() == null) p.setModo(ModoLectura.VISTA);
        progresos.save(p);

        ejemplar.setUltimaApertura(ahora);
        if (ejemplar.getEstado() == EstadoLectura.POR_LEER) {
            LibroServiceImpl.cambiarEstado(ejemplar, EstadoLectura.LEYENDO);
        }
        ejemplares.save(ejemplar);
        return new ResultDTO(mapper.aProgresoDTO(p));
    }

    /**
     * La hora con la que se ordena un progreso (QA SE-13, BI-05). La del
     * dispositivo, salvo que este en el futuro mas alla de la tolerancia: un
     * reloj adelantado (o "9999-12-31") dejaba el progreso congelado para
     * siempre. En ese caso manda la hora del servidor. Se aplica tambien a lo
     * ya guardado, asi que los progresos que quedaron congelados se descongelan.
     */
    static Instant momento(Instant delCliente, Instant ahora) {
        if (delCliente == null || delCliente.isAfter(ahora.plus(TOLERANCIA))) return ahora;
        return delCliente;
    }

    /** NaN, Infinity y valores fuera de rango no se guardan (QA SE-13): 120 con el campo. */
    static void validarNumeros(ProgresoDTO dto) {
        enRango("porcentaje", dto.getPorcentaje(), 0, 100);
        enRango("velocidad", dto.getVelocidad(), 0.25, 5);
        enRango("posicionAudioSeg", dto.getPosicionAudioSeg(), 0, 10_000_000);
    }

    private static void enRango(String campo, Double valor, double min, double max) {
        if (valor == null) return;
        ValidationUtils.exigir(Double.isFinite(valor) && valor >= min && valor <= max,
                Message.Msj.valorFueraDeRango, CodigoError.DATO_INVALIDO, campo, formato(min), formato(max));
    }

    private static String formato(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }

    private Ejemplar propio(Long yo, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
    }
}
