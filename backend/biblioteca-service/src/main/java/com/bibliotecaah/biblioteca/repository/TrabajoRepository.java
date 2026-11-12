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
    /** (v1.4) El taller relee solo las materias del original (relleno de generos de libros viejos). */
    String RELEER_METADATOS = "RELEER_METADATOS";

    int PRIORIDAD_CONVERTIR = 100;
    int PRIORIDAD_CAPITULO_PEDIDO = 10;
    int PRIORIDAD_CAPITULO_SIGUIENTE = 20;
    /** Detras de las conversiones nuevas: el relleno no retrasa a nadie. */
    int PRIORIDAD_RELEER = 200;

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

    /**
     * (v1.5) El capitulo que se escucha pasa por delante: si su trabajo espera
     * con otra prioridad (p. ej. encolado antes como precarga) sube a
     * {@link #PRIORIDAD_CAPITULO_PEDIDO}; los demas capitulos de ese libro y voz
     * que se pidieron antes y aun esperan bajan a {@link #PRIORIDAD_CAPITULO_SIGUIENTE}
     * (el usuario ya no esta en ellos). Devuelve cuantos trabajos cambio.
     */
    int priorizarVoz(UUID archivoId, String vozId, int capitulo);

    /** Fila de bah_lib_audio (estado, duracion_seg, error) o null. */
    Map<String, Object> estadoDelAudio(UUID archivoId, String vozId, int capitulo);

    void olvidarArchivo(UUID archivoId);

    /** Columna JSONB metadatos del archivo, como texto (o null). */
    String metadatosDe(UUID archivoId);

    /**
     * Relleno de generos (v1.4): encola RELEER_METADATOS para cada archivo LISTO
     * que alguien lee con una obra sin generos y cuyas materias aun no se leyeron
     * (sin clave "materias" en sus metadatos) ni se estan leyendo. Idempotente:
     * una vez leidas, el archivo no vuelve a encolarse. Devuelve cuantos encolo.
     */
    int encolarRelecturaDeMaterias();

    /** Obras sin ningun genero de libros y documentos con archivo (para el informe del relleno). */
    int contarObrasSinGenero();
}
