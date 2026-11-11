package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.AudioEstadoPeticionDTO;
import com.bibliotecaah.biblioteca.dto.output.AudioEstadoDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.AudioService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Estado del audio de un capitulo: PENDIENTE | GENERANDO | LISTO | ERROR, o
 * CONVIRTIENDO / ERROR_CONVERSION si el libro aun no esta (o no pudo quedar) LISTO. Si falta (o fallo) se encola con prioridad
 * 10 y, siempre, los 2 siguientes con prioridad 20 si no estan ya: asi al
 * terminar un capitulo el siguiente suele estar listo.
 */
@Service
public class AudioServiceImpl implements AudioService {

    static final String PENDIENTE = "PENDIENTE";
    static final String LISTO = "LISTO";
    static final String ERROR = "ERROR";
    static final String CONVIRTIENDO = "CONVIRTIENDO";
    static final String ERROR_CONVERSION = "ERROR_CONVERSION";
    static final int SIGUIENTES = 2;

    private final EjemplarRepository ejemplares;
    private final TrabajoRepository trabajos;
    private final String prefijo;

    public AudioServiceImpl(EjemplarRepository ejemplares, TrabajoRepository trabajos,
                            @Value("${biblioteca.prefijo-publico}") String prefijo) {
        this.ejemplares = ejemplares;
        this.trabajos = trabajos;
        this.prefijo = prefijo;
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
        if (estado == null || ERROR.equals(estado)) {
            trabajos.encolarVozSiFalta(a.getId(), voz, capitulo, TrabajoRepository.PRIORIDAD_CAPITULO_PEDIDO);
            estado = PENDIENTE;
        }
        for (int s = 1; s <= SIGUIENTES; s++) {
            int siguiente = capitulo + s;
            if (total == null || siguiente < total) {
                trabajos.encolarVozSiFalta(a.getId(), voz, siguiente, TrabajoRepository.PRIORIDAD_CAPITULO_SIGUIENTE);
            }
        }

        AudioEstadoDTO dto = AudioEstadoDTO.builder().estado(estado).build();
        if (LISTO.equals(estado)) {
            Object duracion = fila.get("duracion_seg");
            dto.setDuracionSeg(duracion == null ? null : ((Number) duracion).doubleValue());
            String base = prefijo + "/v1/archivos/" + a.getId() + "/audio/" + voz + "/" + String.format("cap-%03d", capitulo);
            dto.setUrl1x(base + ".m4a");
            dto.setUrl2x(base + "-2x.m4a");
            dto.setUrlTiempos(base + ".tiempos.json");
        }
        return dto;
    }
}
