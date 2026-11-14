package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.EstadoCasaDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * (0.4.0, contrato C6) La "lampara" de la casa: si el taller, el traductor y el
 * disco responden, y cuanto trabajo de voz hay en cola. No es de ningun usuario
 * (lo mismo para todos) y se guarda 15 s: muchas pestanas preguntando no
 * multiplican las sondas.
 *
 * - taller: GET /salud con 2 s de conexion y 3 s de lectura. CAIDO si no
 *   responde; LENTO si tarda mas de 1,5 s, si algun hilo de trabajo murio o si
 *   un capitulo que alguien espera lleva mas de 2 min sin empezar.
 * - traductor: GET /health (CAIDO si no responde o aun carga modelos).
 * - disco: la carpeta /datos existe.
 */
@Slf4j
@Component
public class EstadoDeLaCasa {

    static final Duration VIGENCIA = Duration.ofSeconds(15);
    static final Duration LENTO = Duration.ofMillis(1500);
    static final int MINUTOS_ATASCO = 2;
    static final String OK = "OK";

    /** Sondas de salud: se pueden sustituir en las pruebas. */
    interface Sonda {
        /** Respuesta JSON de la URL de salud; lanza si no responde o no es 2xx. */
        JsonNode consultar();
    }

    private final Sonda taller;
    private final Sonda traductor;
    private final AlmacenDeArchivos almacen;
    private final TrabajoRepository trabajos;
    private final Mensajes mensajes;
    private final Clock reloj;

    private EstadoCasaDTO enCache;
    private Instant cacheHasta = Instant.MIN;

    @Autowired
    public EstadoDeLaCasa(@Value("${biblioteca.taller-url}") String urlTaller,
                          @Value("${biblioteca.traductor.url:http://traductor:5000}") String urlTraductor,
                          AlmacenDeArchivos almacen, TrabajoRepository trabajos, Mensajes mensajes) {
        this(sonda(urlTaller, "/salud"), sonda(urlTraductor, "/health"), almacen, trabajos, mensajes,
                Clock.systemUTC());
    }

    EstadoDeLaCasa(Sonda taller, Sonda traductor, AlmacenDeArchivos almacen, TrabajoRepository trabajos,
                   Mensajes mensajes, Clock reloj) {
        this.taller = taller;
        this.traductor = traductor;
        this.almacen = almacen;
        this.trabajos = trabajos;
        this.mensajes = mensajes;
        this.reloj = reloj;
    }

    static Sonda sonda(String base, String ruta) {
        SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(2000);
        fabrica.setReadTimeout(3000);
        RestClient cliente = RestClient.builder().baseUrl(base).requestFactory(fabrica).build();
        return () -> cliente.get().uri(ruta).retrieve().body(JsonNode.class);
    }

    public synchronized EstadoCasaDTO estado() {
        Instant ahora = reloj.instant();
        if (enCache != null && ahora.isBefore(cacheHasta)) return enCache;

        String disco = almacen.disponible() ? OK : "DESCONECTADO";
        String estadoTaller = estadoDelTaller();
        String estadoTraductor = responde(traductor, "traductor") ? OK : "CAIDO";
        int cola = trabajos.colaDeVoz();

        Message.Msj aviso = null;
        if (!OK.equals(disco)) aviso = Message.Msj.casaDiscoDesconectado;
        else if ("CAIDO".equals(estadoTaller)) aviso = Message.Msj.casaTallerCaido;
        else if ("LENTO".equals(estadoTaller)) aviso = Message.Msj.casaTallerLento;
        else if (!OK.equals(estadoTraductor)) aviso = Message.Msj.casaTraductorCaido;

        enCache = EstadoCasaDTO.builder().taller(estadoTaller).traductor(estadoTraductor).disco(disco)
                .colaVoz(cola).mensaje(aviso == null ? null : mensajes.texto(aviso)).build();
        cacheHasta = ahora.plus(VIGENCIA);
        return enCache;
    }

    private String estadoDelTaller() {
        Instant antes = reloj.instant();
        JsonNode salud;
        try {
            salud = taller.consultar();
        } catch (RuntimeException e) {
            log.warn("Estado de la casa: el taller no responde ({})", e.getMessage());
            return "CAIDO";
        }
        boolean tardo = Duration.between(antes, reloj.instant()).compareTo(LENTO) > 0;
        boolean hiloMuerto = false;
        if (salud != null) {
            for (JsonNode t : salud.path("trabajadores")) {
                if (t.path("vivo").isBoolean() && !t.path("vivo").asBoolean()) hiloMuerto = true;
            }
        }
        if (tardo || hiloMuerto || trabajos.vozUrgenteAtascada(MINUTOS_ATASCO)) {
            log.info("Estado de la casa: taller LENTO (tardo={}, hilo muerto={})", tardo, hiloMuerto);
            return "LENTO";
        }
        return OK;
    }

    private static boolean responde(Sonda sonda, String quien) {
        try {
            sonda.consultar();
            return true;
        } catch (RuntimeException e) {
            log.warn("Estado de la casa: el {} no responde ({})", quien, e.getMessage());
            return false;
        }
    }
}
