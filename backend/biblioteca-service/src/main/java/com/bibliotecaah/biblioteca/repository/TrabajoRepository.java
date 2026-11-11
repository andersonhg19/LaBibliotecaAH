package com.bibliotecaah.biblioteca.repository;

import java.util.Map;
import java.util.UUID;

/**
 * Cola de trabajos del taller y estado del audio (contratos.md §7). SQL directo:
 * esas tablas tienen el DDL exacto del contrato, con JSONB, y las comparte el taller.
 */
public interface TrabajoRepository {

    String CONVERTIR = "CONVERTIR";
    String VOZ_CAPITULO = "VOZ_CAPITULO";

    int PRIORIDAD_CONVERTIR = 100;
    int PRIORIDAD_CAPITULO_PEDIDO = 10;
    int PRIORIDAD_CAPITULO_SIGUIENTE = 20;

    UUID encolarConversion(UUID archivoId);

    /** Minutos sin latido tras los que un EN_CURSO o un GENERANDO se da por muerto (QA DA-01). El taller late cada 60 s y reabre los suyos a los 5 min; esto es la red de seguridad. */
    int MINUTOS_SIN_LATIDO = 10;

    /**
     * Encola la voz de un capitulo si hace falta: no si hay un trabajo vivo
     * (PENDIENTE, o EN_CURSO con latido reciente), ni audio LISTO, ni GENERANDO
     * reciente, ni ERROR (un ERROR solo se reintenta con {@link #reintentarVoz}).
     */
    boolean encolarVozSiFalta(UUID archivoId, String vozId, int capitulo, int prioridad);

    /** Un capitulo en ERROR vuelve a PENDIENTE y se encola (peticion explicita, QA DA-02). */
    void reintentarVoz(UUID archivoId, String vozId, int capitulo, int prioridad);

    /** Fila de bah_lib_audio (estado, duracion_seg, error) o null. */
    Map<String, Object> estadoDelAudio(UUID archivoId, String vozId, int capitulo);

    void olvidarArchivo(UUID archivoId);

    /** Columna JSONB metadatos del archivo, como texto (o null). */
    String metadatosDe(UUID archivoId);
}
