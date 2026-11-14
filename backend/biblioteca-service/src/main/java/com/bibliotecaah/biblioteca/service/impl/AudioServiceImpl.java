package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.AudioEstadoPeticionDTO;
import com.bibliotecaah.biblioteca.dto.input.PrepararLibroDTO;
import com.bibliotecaah.biblioteca.dto.output.AudioEstadoDTO;
import com.bibliotecaah.biblioteca.dto.output.CapituloDTO;
import com.bibliotecaah.biblioteca.dto.output.PreparacionLibroDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.AudioService;
import com.bibliotecaah.biblioteca.service.CapituloVozService;
import com.bibliotecaah.biblioteca.service.VozService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;

/**
 * Estado del audio de un capitulo: PENDIENTE | GENERANDO | LISTO | ERROR, o
 * CONVIRTIENDO / ERROR_CONVERSION si el libro aun no esta (o no pudo quedar) LISTO. Si falta (o fallo) se encola con prioridad
 * 10 y, siempre, los 2 siguientes con prioridad 20 si no estan ya: asi al
 * terminar un capitulo el siguiente suele estar listo.
 *
 * (v1.5) El capitulo pedido pasa por delante de las precargas y de lo que se
 * pidio antes de ese libro, y mientras se genera se anuncia urlPartes en cuanto
 * el taller escribio la primera parte reproducible (contratos §6 bis).
 */
@Service
public class AudioServiceImpl implements AudioService {

    static final String PENDIENTE = "PENDIENTE";
    static final String LISTO = "LISTO";
    static final String GENERANDO = "GENERANDO";
    static final String ERROR = "ERROR";
    static final String CONVIRTIENDO = "CONVIRTIENDO";
    static final String ERROR_CONVERSION = "ERROR_CONVERSION";
    static final int SIGUIENTES = 2;
    /** (0.4.0) Cuantos capitulos se miran hacia delante buscando los 2 siguientes que van en voz. */
    static final int MIRAR_ADELANTE = 50;

    private final EjemplarRepository ejemplares;
    private final TrabajoRepository trabajos;
    private final String prefijo;
    private final VozService voces;
    private final AlmacenDeArchivos almacen;
    private final CapituloVozService capitulosEnVoz;

    public AudioServiceImpl(EjemplarRepository ejemplares, TrabajoRepository trabajos, VozService voces,
                            AlmacenDeArchivos almacen, CapituloVozService capitulosEnVoz,
                            @Value("${biblioteca.prefijo-publico}") String prefijo) {
        this.capitulosEnVoz = capitulosEnVoz;
        this.ejemplares = ejemplares;
        this.trabajos = trabajos;
        this.prefijo = prefijo;
        this.voces = voces;
        this.almacen = almacen;
    }

    @Override
    @Transactional
    public AudioEstadoDTO estado(AudioEstadoPeticionDTO peticion) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = ValidationUtils.encontrado(ejemplares.delUsuario(peticion.getEjemplarId(), yo),
                Message.Msj.libroNoEncontrado);
        Archivo a = e.getArchivo();
        ValidationUtils.exigir(a != null, Message.Msj.libroSinArchivo, CodigoError.DATO_INVALIDO);
        String voz = ValidationUtils.vozId(peticion.getVozId());
        /* QA SE-06 / DA-12: solo voces del catalogo. Antes se encolaban voces y
           motores inventados y el taller los reintentaba como si fuera una caida. */
        ValidationUtils.exigir(voces.getAll().stream().anyMatch(v -> voz.equals(v.getId())),
                Message.Msj.vozNoDisponible, CodigoError.DATO_INVALIDO, voz);
        if (!Archivo.LISTO.equals(a.getEstadoConversion())) {
            /* Contrato v1.1: la voz SOLO se encola con el archivo LISTO. Mientras
               tanto se informa y no se encola nada. */
            return AudioEstadoDTO.builder()
                    .estado(Archivo.ERROR.equals(a.getEstadoConversion()) ? ERROR_CONVERSION : CONVIRTIENDO)
                    .build();
        }
        int capitulo = peticion.getCapitulo();
        Integer total = a.getNCapitulos();
        if (total != null) {
            ValidationUtils.exigir(capitulo < total, Message.Msj.capituloFueraDeRango, CodigoError.DATO_INVALIDO,
                    total, Math.max(total - 1, 0));
        }

        Map<String, Object> fila = trabajos.estadoDelAudio(a.getId(), voz, capitulo);
        String estado = fila == null ? null : String.valueOf(fila.get("estado"));
        String error = null;
        if (ERROR.equals(estado) && Boolean.TRUE.equals(peticion.getReintentar())) {
            /* QA DA-02: un ERROR solo se reintenta cuando se pide. */
            trabajos.reintentarVoz(a.getId(), voz, capitulo, TrabajoRepository.PRIORIDAD_CAPITULO_PEDIDO);
            estado = PENDIENTE;
        } else if (ERROR.equals(estado)) {
            error = fila.get("error") == null ? null : String.valueOf(fila.get("error"));
        } else {
            boolean encolado = trabajos.encolarVozSiFalta(a.getId(), voz, capitulo,
                    TrabajoRepository.PRIORIDAD_CAPITULO_PEDIDO);
            if (estado == null || encolado) estado = PENDIENTE;
        }
        trabajos.priorizarVoz(a.getId(), voz, capitulo);

        AudioEstadoDTO dto = AudioEstadoDTO.builder().estado(estado).error(error).build();
        String base = prefijo + "/v1/archivos/" + a.getId() + "/audio/" + voz + "/" + String.format("cap-%03d", capitulo);
        boolean esperandoPrimerAudio = PENDIENTE.equals(estado) || GENERANDO.equals(estado);
        if (esperandoPrimerAudio) {
            String partes = String.format("cap-%03d.partes.json", capitulo);
            if (Files.isRegularFile(almacen.audio(a.getId(), voz, partes))) {
                dto.setUrlPartes(base + ".partes.json");
                esperandoPrimerAudio = false;
            }
        }
        /* (v1.5) La precarga de los siguientes espera a que el pedido ya suene
           (LISTO o con su primera parte): asi no le quita voz al servicio en
           los primeros segundos, que son los que se notan. */
        if (!esperandoPrimerAudio) {
            /* (0.4.0, C3) Los capitulos que el usuario (o la estructura) deja fuera de
               la voz no se precargan: se buscan los 2 siguientes que SI van. */
            Set<Integer> fuera = fueraDeLaVoz(yo, e);
            int encolados = 0;
            for (int siguiente = capitulo + 1; encolados < SIGUIENTES && siguiente <= capitulo + MIRAR_ADELANTE
                    && (total == null || siguiente < total); siguiente++) {
                if (fuera.contains(siguiente)) continue;
                trabajos.encolarVozSiFalta(a.getId(), voz, siguiente, TrabajoRepository.PRIORIDAD_CAPITULO_SIGUIENTE);
                encolados++;
            }
        }
        if (LISTO.equals(estado)) {
            Object duracion = fila.get("duracion_seg");
            dto.setDuracionSeg(duracion == null ? null : ((Number) duracion).doubleValue());
            dto.setUrl1x(base + ".m4a");
            dto.setUrl2x(base + "-2x.m4a");
            dto.setUrlTiempos(base + ".tiempos.json");
        }
        return dto;
    }

    // ------------------------------------------------------------------ 0.4.0: preparar el libro entero (C5)

    @Override
    @Transactional
    public PreparacionLibroDTO preparar(PrepararLibroDTO peticion) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = paraPreparar(yo, peticion.getEjemplarId());
        String voz = vozDelCatalogo(peticion.getVozId());
        UUID archivo = e.getArchivo().getId();
        Map<Integer, String> estados = trabajos.estadosDeVoz(archivo, voz);
        Set<Integer> enCola = trabajos.capitulosEnCola(archivo, voz);
        int encolados = 0;
        for (int capitulo : enVoz(yo, e)) {
            String estado = estados.get(capitulo);
            if (LISTO.equals(estado) || ERROR.equals(estado) || enCola.contains(capitulo)) continue;
            if (trabajos.encolarVozSiFalta(archivo, voz, capitulo, TrabajoRepository.PRIORIDAD_PREPARAR_LIBRO)) {
                encolados++;
            }
        }
        PreparacionLibroDTO dto = contar(yo, e, voz);
        dto.setEncolados(encolados);
        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public PreparacionLibroDTO preparacion(UUID ejemplarId, String vozId) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = paraPreparar(yo, ejemplarId);
        return contar(yo, e, vozDelCatalogo(vozId));
    }

    private PreparacionLibroDTO contar(Long yo, Ejemplar e, String voz) {
        UUID archivo = e.getArchivo().getId();
        Map<Integer, String> estados = trabajos.estadosDeVoz(archivo, voz);
        Set<Integer> enCola = trabajos.capitulosEnCola(archivo, voz);
        List<Integer> capitulos = enVoz(yo, e);
        int listos = 0;
        int cola = 0;
        int error = 0;
        for (int capitulo : capitulos) {
            String estado = estados.get(capitulo);
            if (LISTO.equals(estado)) listos++;
            else if (ERROR.equals(estado)) error++;
            else if (enCola.contains(capitulo) || GENERANDO.equals(estado)) cola++;
        }
        return PreparacionLibroDTO.builder().total(capitulos.size()).listos(listos).enCola(cola).error(error).build();
    }

    private Ejemplar paraPreparar(Long yo, UUID ejemplarId) {
        Ejemplar e = ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
        ValidationUtils.exigir(e.getArchivo() != null, Message.Msj.libroSinArchivo, CodigoError.DATO_INVALIDO);
        ValidationUtils.exigir(Archivo.LISTO.equals(e.getArchivo().getEstadoConversion()),
                Message.Msj.capitulosNoDisponibles, CodigoError.DATO_INVALIDO);
        return e;
    }

    private String vozDelCatalogo(String vozId) {
        String voz = ValidationUtils.vozId(vozId);
        ValidationUtils.exigir(voces.getAll().stream().anyMatch(v -> voz.equals(v.getId())),
                Message.Msj.vozNoDisponible, CodigoError.DATO_INVALIDO, voz);
        return voz;
    }

    /**
     * Indices de los capitulos con enVoz efectivo = true. Sin estructura legible
     * (disco fuera) pero con n_capitulos, todos: como un libro v1.
     */
    private List<Integer> enVoz(Long yo, Ejemplar e) {
        List<CapituloDTO> capitulos = capitulosEnVoz.capitulos(yo, e);
        if (capitulos.isEmpty()) {
            Integer total = e.getArchivo().getNCapitulos();
            return total == null ? List.of() : IntStream.range(0, total).boxed().toList();
        }
        List<Integer> lista = new ArrayList<>();
        for (CapituloDTO c : capitulos) {
            if (c.isEnVoz()) lista.add(c.getIndice());
        }
        return lista;
    }

    /** Indices con enVoz efectivo = false (vacio en un libro v1 o sin estructura). */
    private Set<Integer> fueraDeLaVoz(Long yo, Ejemplar e) {
        Set<Integer> fuera = new HashSet<>();
        for (CapituloDTO c : capitulosEnVoz.capitulos(yo, e)) {
            if (!c.isEnVoz()) fuera.add(c.getIndice());
        }
        return fuera;
    }
}
