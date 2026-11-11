package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.client.TallerClient;
import com.bibliotecaah.biblioteca.dto.output.VozDTO;
import com.bibliotecaah.biblioteca.service.VozService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Catalogo de voces. Lo manda el taller (GET /voces) y se guarda 10 minutos; si
 * el taller no responde se usa el catalogo inicial que Anderson aprobo
 * (contratos.md §8), con Alvaro por defecto.
 */
@Slf4j
@Service
public class VozServiceImpl implements VozService {

    static final Duration VIGENCIA = Duration.ofMinutes(10);

    static final List<VozDTO> CATALOGO_INICIAL = List.of(
            voz("edge.es-ES-AlvaroNeural", "Álvaro", "España", "M"),
            voz("edge.es-ES-ElviraNeural", "Elvira", "España", "F"),
            voz("edge.es-ES-XimenaNeural", "Ximena", "España", "F"),
            voz("edge.es-HN-CarlosNeural", "Carlos", "Honduras", "M"),
            voz("edge.es-CO-GonzaloNeural", "Gonzalo", "Colombia", "M"),
            voz("edge.es-CO-SalomeNeural", "Salomé", "Colombia", "F"),
            voz("edge.es-MX-JorgeNeural", "Jorge", "México", "M"),
            voz("edge.es-US-AlonsoNeural", "Alonso", "Estados Unidos", "M"),
            voz("edge.es-AR-TomasNeural", "Tomás", "Argentina", "M"));

    private final TallerClient taller;
    private final String porDefecto;
    private final Clock reloj;

    private List<VozDTO> enCache;
    private Instant cacheHasta = Instant.MIN;

    @Autowired
    public VozServiceImpl(TallerClient taller, @Value("${biblioteca.voz-por-defecto}") String porDefecto) {
        this(taller, porDefecto, Clock.systemUTC());
    }

    VozServiceImpl(TallerClient taller, String porDefecto, Clock reloj) {
        this.taller = taller;
        this.porDefecto = porDefecto;
        this.reloj = reloj;
    }

    @Override
    public synchronized List<VozDTO> getAll() {
        Instant ahora = reloj.instant();
        if (enCache != null && ahora.isBefore(cacheHasta)) return enCache;
        try {
            List<Map<String, Object>> crudo = taller.voces();
            List<VozDTO> voces = crudo == null ? List.of() : crudo.stream().map(this::aVoz).toList();
            if (voces.isEmpty()) return respaldo();
            enCache = voces;
            cacheHasta = ahora.plus(VIGENCIA);
            return enCache;
        } catch (RuntimeException e) {
            log.warn("El taller no respondio el catalogo de voces ({}); se usa el catalogo inicial", e.getMessage());
            return respaldo();
        }
    }

    private List<VozDTO> respaldo() {
        return CATALOGO_INICIAL.stream().map(v -> VozDTO.builder().id(v.getId()).nombre(v.getNombre())
                .pais(v.getPais()).genero(v.getGenero()).motor(v.getMotor())
                .porDefecto(v.getId().equals(porDefecto)).build()).toList();
    }

    private VozDTO aVoz(Map<String, Object> m) {
        String id = String.valueOf(m.get("id"));
        return VozDTO.builder()
                .id(id)
                .nombre(texto(m, "nombre", id))
                .pais(texto(m, "pais", ""))
                .genero(texto(m, "genero", ""))
                .motor(texto(m, "motor", id.contains(".") ? id.substring(0, id.indexOf('.')) : ""))
                .porDefecto(m.get("porDefecto") instanceof Boolean b ? b : id.equals(porDefecto))
                .build();
    }

    private static String texto(Map<String, Object> m, String clave, String siNo) {
        Object v = m.get(clave);
        return v == null ? siNo : v.toString();
    }

    private static VozDTO voz(String id, String nombre, String pais, String genero) {
        return VozDTO.builder().id(id).nombre(nombre).pais(pais).genero(genero).motor("edge").build();
    }
}
