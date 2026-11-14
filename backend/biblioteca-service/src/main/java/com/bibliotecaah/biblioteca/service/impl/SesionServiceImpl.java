package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.LatidoDTO;
import com.bibliotecaah.biblioteca.dto.output.DiaDeLecturaDTO;
import com.bibliotecaah.biblioteca.dto.output.LatidoRespuestaDTO;
import com.bibliotecaah.biblioteca.dto.output.MinutosDeLibroDTO;
import com.bibliotecaah.biblioteca.dto.output.ResumenSesionesDTO;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.ModoSesion;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.SesionRepository;
import com.bibliotecaah.biblioteca.service.SesionService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Sesiones de lectura (contrato C4, auditoria P-01). El cliente late cada
 * minuto mientras lee o escucha; aqui se acumula el tiempo por sesion y se
 * resume por dia, por libro y en rachas.
 *
 * ZONA: los dias son los de la casa (spring.jackson.time-zone = America/Bogota,
 * estandares §12), no los de UTC: leer a las 9 de la noche cuenta para ese dia.
 * Un dia cuenta para la racha con al menos 1 minuto. La sesion se apunta al dia
 * en que empezo.
 */
@Service
public class SesionServiceImpl implements SesionService {

    /** Segundos minimos de un dia para la racha. */
    static final int MINIMO_DIA = 60;
    /** Periodo por defecto del resumen y periodo maximo. */
    static final int DIAS_POR_DEFECTO = 30;
    static final int DIAS_MAXIMOS = 366;

    private final SesionRepository sesiones;
    private final EjemplarRepository ejemplares;
    private final ZoneId zona;
    private final Clock reloj;

    @Autowired
    public SesionServiceImpl(SesionRepository sesiones, EjemplarRepository ejemplares,
                             @Value("${spring.jackson.time-zone:America/Bogota}") String zona) {
        this(sesiones, ejemplares, ZoneId.of(zona), Clock.systemUTC());
    }

    SesionServiceImpl(SesionRepository sesiones, EjemplarRepository ejemplares, ZoneId zona, Clock reloj) {
        this.sesiones = sesiones;
        this.ejemplares = ejemplares;
        this.zona = zona;
        this.reloj = reloj;
    }

    @Override
    @Transactional
    public LatidoRespuestaDTO latido(LatidoDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = ValidationUtils.encontrado(ejemplares.delUsuario(dto.getEjemplarId(), yo),
                Message.Msj.libroNoEncontrado);
        BigDecimal posicion = null;
        if (dto.getPosicion() != null) {
            ValidationUtils.exigir(Double.isFinite(dto.getPosicion()) && dto.getPosicion() >= 0
                            && dto.getPosicion() <= 10_000_000, Message.Msj.valorFueraDeRango, CodigoError.DATO_INVALIDO,
                    "posicion", "0", "10000000");
            posicion = BigDecimal.valueOf(dto.getPosicion()).setScale(4, RoundingMode.HALF_UP);
        }
        String dispositivo = dto.getDispositivo() == null || dto.getDispositivo().isBlank()
                ? null : dto.getDispositivo().trim();
        UUID id = dto.getSesionId() == null ? UUID.randomUUID() : dto.getSesionId();
        Integer total = sesiones.latido(new SesionRepository.Latido(id, yo, e.getId(), dto.getModo().name(),
                dto.getSegundos(), dto.getCapitulo(), posicion, dispositivo, reloj.instant()));
        /* Un sesionId de otra persona (o de otro libro) no se toca ni se confirma que exista. */
        ValidationUtils.exigir(total != null, Message.Msj.sesionAjena, CodigoError.NO_ENCONTRADO);
        return new LatidoRespuestaDTO(id, total);
    }

    @Override
    @Transactional(readOnly = true)
    public ResumenSesionesDTO resumen(LocalDate desdePedido, LocalDate hastaPedido) {
        Long yo = SecurityUtils.usuarioActual();
        LocalDate hoy = LocalDate.now(reloj.withZone(zona));
        LocalDate hasta = hastaPedido == null ? hoy : hastaPedido;
        LocalDate desde = desdePedido == null ? hasta.minusDays(DIAS_POR_DEFECTO - 1L) : desdePedido;
        long dias = ChronoUnit.DAYS.between(desde, hasta) + 1;
        ValidationUtils.exigir(dias >= 1 && dias <= DIAS_MAXIMOS, Message.Msj.rangoDeFechasInvalido,
                CodigoError.DATO_INVALIDO, DIAS_MAXIMOS);

        long lectura = 0;
        long voz = 0;
        Map<LocalDate, Long> porDia = new HashMap<>();
        Map<UUID, Long> porLibro = new LinkedHashMap<>();
        Map<UUID, String> titulos = new HashMap<>();
        for (SesionRepository.Fila f : sesiones.porDia(yo, desde, hasta, zona.getId())) {
            if (ModoSesion.VOZ.name().equals(f.modo())) voz += f.segundos();
            else lectura += f.segundos();
            porDia.merge(f.dia(), f.segundos(), Long::sum);
            porLibro.merge(f.ejemplarId(), f.segundos(), Long::sum);
            titulos.putIfAbsent(f.ejemplarId(), f.titulo());
        }
        List<DiaDeLecturaDTO> listaDias = new ArrayList<>();
        for (LocalDate d = desde; !d.isAfter(hasta); d = d.plusDays(1)) {
            listaDias.add(new DiaDeLecturaDTO(d, minutos(porDia.getOrDefault(d, 0L))));
        }
        List<MinutosDeLibroDTO> libros = porLibro.entrySet().stream()
                .sorted(Map.Entry.<UUID, Long>comparingByValue(Comparator.reverseOrder()))
                .map(x -> new MinutosDeLibroDTO(x.getKey(), titulos.get(x.getKey()), minutos(x.getValue())))
                .toList();
        List<LocalDate> activos = sesiones.diasActivos(yo, zona.getId(), MINIMO_DIA);
        return ResumenSesionesDTO.builder()
                .desde(desde).hasta(hasta)
                .minutosLectura(minutos(lectura)).minutosVoz(minutos(voz))
                .dias(listaDias)
                .rachaActual(rachaActual(activos, hoy))
                .rachaMaxima(rachaMaxima(activos))
                .libros(libros)
                .build();
    }

    static int minutos(long segundos) {
        return (int) Math.round(segundos / 60.0);
    }

    /** Dias seguidos que terminan hoy, o ayer si hoy aun no hay lectura (la racha sigue viva hasta medianoche). */
    static int rachaActual(List<LocalDate> activos, LocalDate hoy) {
        java.util.Set<LocalDate> dias = new java.util.HashSet<>(activos);
        LocalDate d = dias.contains(hoy) ? hoy : hoy.minusDays(1);
        int racha = 0;
        while (dias.contains(d)) {
            racha++;
            d = d.minusDays(1);
        }
        return racha;
    }

    /** La racha mas larga: {@code activos} en orden ascendente y sin repetir. */
    static int rachaMaxima(List<LocalDate> activos) {
        int mejor = 0;
        int actual = 0;
        LocalDate anterior = null;
        for (LocalDate d : activos) {
            actual = anterior != null && anterior.plusDays(1).equals(d) ? actual + 1 : 1;
            mejor = Math.max(mejor, actual);
            anterior = d;
        }
        return mejor;
    }
}
