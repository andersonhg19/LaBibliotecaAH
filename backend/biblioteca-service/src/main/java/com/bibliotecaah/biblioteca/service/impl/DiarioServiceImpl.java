package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.DiarioDTO;
import com.bibliotecaah.biblioteca.dto.input.EventoDiarioDTO;
import com.bibliotecaah.biblioteca.dto.output.DiarioGuardadoDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.DiarioRepository;
import com.bibliotecaah.biblioteca.service.DiarioService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.LimitadorPorUsuario;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * (0.5.0, C9) Diario del reproductor. Cada evento se guarda en bah_lib_diario y deja una linea
 * {@code INFO diario usuario=... tipo=... cap=... pos=... detalle=...} para {@code docker logs}.
 * <ul>
 *   <li>El usuario es el del token; un {@code ejemplarId} ajeno o inexistente se guarda como null
 *       (es telemetria: no es un error).</li>
 *   <li>Como mucho {@code biblioteca.diario.eventos-por-hora} (600) eventos por usuario y hora: los de
 *       mas se descartan en silencio y la respuesta dice cuantos se guardaron de verdad.</li>
 *   <li>{@code contexto}: objeto plano (texto, numero, booleano o null) de hasta 2 KB en JSON, con
 *       {@code ua} de hasta 200 caracteres. Si no, 120 y no se guarda nada del lote.</li>
 * </ul>
 */
@Slf4j
@Service
public class DiarioServiceImpl implements DiarioService {

    static final int CONTEXTO_MAXIMO_BYTES = 2048;
    static final int UA_MAXIMO = 200;

    private final DiarioRepository diario;
    private final ObjectMapper json;
    private final LimitadorPorUsuario tope;

    @Autowired
    public DiarioServiceImpl(DiarioRepository diario, ObjectMapper json,
                             @Value("${biblioteca.diario.eventos-por-hora:600}") long porHora) {
        this(diario, json, new LimitadorPorUsuario(porHora, Duration.ofHours(1), Clock.systemUTC()));
    }

    DiarioServiceImpl(DiarioRepository diario, ObjectMapper json, LimitadorPorUsuario tope) {
        this.diario = diario;
        this.json = json;
        this.tope = tope;
    }

    @Override
    public DiarioGuardadoDTO guardar(DiarioDTO lote) {
        Long yo = SecurityUtils.usuarioActual();
        List<EventoDiarioDTO> eventos = lote.getEventos();
        /* Primero se valida TODO el lote: un lote con un evento malo no deja nada a medias. */
        List<String> contextos = new ArrayList<>();
        for (int i = 0; i < eventos.size(); i++) {
            contextos.add(contexto(eventos.get(i).getContexto(), i));
        }
        int caben = (int) tope.consumirHasta(yo, eventos.size());
        if (caben < eventos.size()) {
            log.warn("diario usuario={}: tope de {} eventos por hora; {} descartado(s)", yo, tope.capacidad(),
                    eventos.size() - caben);
        }
        if (caben == 0) return new DiarioGuardadoDTO(0);

        List<EventoDiarioDTO> guardables = eventos.subList(0, caben);
        Set<UUID> propios = diario.ejemplaresDelUsuario(yo,
                guardables.stream().map(EventoDiarioDTO::getEjemplarId).filter(Objects::nonNull).distinct().toList());
        List<DiarioRepository.Evento> filas = new ArrayList<>();
        for (int i = 0; i < caben; i++) {
            EventoDiarioDTO e = guardables.get(i);
            UUID ejemplar = e.getEjemplarId() != null && propios.contains(e.getEjemplarId()) ? e.getEjemplarId() : null;
            filas.add(new DiarioRepository.Evento(yo, ejemplar, e.getCuando(), e.getTipo(), e.getCapitulo(),
                    e.getPosicion(), vacioComoNulo(e.getDetalle()), contextos.get(i)));
        }
        diario.guardar(filas);
        for (DiarioRepository.Evento f : filas) {
            log.info("diario usuario={} tipo={} cap={} pos={} detalle={}", yo, f.tipo(), f.capitulo(), f.posicion(),
                    deUnaLinea(f.detalle()));
        }
        return new DiarioGuardadoDTO(caben);
    }

    /** El contexto como JSON (o null), si es un objeto plano de hasta 2 KB con ua de hasta 200; si no, 120. */
    String contexto(Map<String, Object> contexto, int indice) {
        if (contexto == null) return null;
        boolean plano = contexto.values().stream().allMatch(v -> v == null || v instanceof String
                || v instanceof Number || v instanceof Boolean);
        Object ua = contexto.get("ua");
        boolean uaBien = !(ua instanceof String s) || s.length() <= UA_MAXIMO;
        String texto = null;
        if (plano && uaBien) {
            try {
                texto = json.writeValueAsString(contexto);
            } catch (JsonProcessingException e) {
                log.warn("diario: contexto del evento {} no serializable: {}", indice, e.getMessage());
            }
        }
        ValidationUtils.exigir(texto != null && texto.getBytes(StandardCharsets.UTF_8).length <= CONTEXTO_MAXIMO_BYTES,
                Message.Msj.diarioContextoInvalido, CodigoError.DATO_INVALIDO, String.valueOf(indice),
                String.valueOf(CONTEXTO_MAXIMO_BYTES), String.valueOf(UA_MAXIMO));
        return texto;
    }

    /** Sin saltos de linea ni caracteres de control: una linea de log por evento, sin lineas falsas. */
    static String deUnaLinea(String texto) {
        return texto == null ? null : texto.replaceAll("\\p{Cntrl}", " ");
    }

    static String vacioComoNulo(String v) {
        return v == null || v.isBlank() ? null : v;
    }
}
