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

    /** Encola la voz de un capitulo si no hay trabajo vivo ni audio LISTO/GENERANDO. */
    boolean encolarVozSiFalta(UUID archivoId, String vozId, int capitulo, int prioridad);

    /** Fila de bah_lib_audio (estado, duracion_seg) o null. */
    Map<String, Object> estadoDelAudio(UUID archivoId, String vozId, int capitulo);

    void olvidarArchivo(UUID archivoId);

    /** Columna JSONB metadatos del archivo, como texto (o null). */
    String metadatosDe(UUID archivoId);
}
