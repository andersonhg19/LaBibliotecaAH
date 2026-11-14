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
    /** (0.4.0, contrato C2) El taller reclasifica la estructura de un libro ya convertido (v1 -> v2). */
    String RECLASIFICAR_ESTRUCTURA = "RECLASIFICAR_ESTRUCTURA";

    int PRIORIDAD_CONVERTIR = 100;
    int PRIORIDAD_CAPITULO_PEDIDO = 10;
    int PRIORIDAD_CAPITULO_SIGUIENTE = 20;
    /** Detras de las conversiones nuevas: el relleno no retrasa a nadie. */
    int PRIORIDAD_RELEER = 200;
    /** (0.4.0, C2) Como RELEER_METADATOS: detras de todo lo demas. */
    int PRIORIDAD_RECLASIFICAR = 200;
    /**
     * (0.4.0, C5) "Preparar el libro entero": detras de lo que alguien escucha (10)
     * y de las precargas (20), pero antes de las conversiones nuevas (100 van en otro hilo).
     */
    int PRIORIDAD_PREPARAR_LIBRO = 40;
    /**
     * (B17) Regenerar un capitulo YA LISTO porque cambio el diccionario de
     * pronunciacion: detras de lo que alguien escucha (10) y de las precargas
     * (20), delante de "preparar el libro" (40). Si alguien pide ese capitulo,
     * priorizarVoz lo sube a 10 como a cualquier otro.
     */
    int PRIORIDAD_REGENERAR = 30;

    /**
     * (B17) Fragmento SQL (un parametro: archivo_id) que da {"pronunciacion": [{de, a}...]}
     * con el diccionario del archivo, o {} si no tiene: se mezcla (||) en el payload de VOZ_CAPITULO.
     */
    String PRONUNCIACION_DEL_ARCHIVO = "COALESCE((SELECT jsonb_build_object('pronunciacion', "
            + "jsonb_agg(jsonb_build_object('de', p.de, 'a', p.a) ORDER BY lower(p.de))) "
            + "FROM bah_lib_pronunciacion p WHERE p.archivo_id = ? HAVING count(*) > 0), '{}'::jsonb)";

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

    // ------------------------------------------------------------------ 0.4.0

    /** Ids de los archivos con la conversion LISTO. */
    java.util.List<UUID> archivosListos();

    /**
     * (C2) Encola RECLASIFICAR_ESTRUCTURA (payload {}, prioridad 200) si ese
     * archivo no tiene ya uno vivo (PENDIENTE o EN_CURSO). true si lo encolo.
     */
    boolean encolarReclasificacionSiFalta(UUID archivoId);

    /** (C5) capitulo -> estado en bah_lib_audio (PENDIENTE | GENERANDO | LISTO | ERROR) de ese archivo y voz. */
    Map<Integer, String> estadosDeVoz(UUID archivoId, String vozId);

    /** (C5) Capitulos de ese archivo y voz con un trabajo VOZ_CAPITULO vivo (PENDIENTE o EN_CURSO con latido). */
    java.util.Set<Integer> capitulosEnCola(UUID archivoId, String vozId);

    /** (C6) Trabajos de voz vivos en toda la casa. */
    int colaDeVoz();

    /** (C6) true si un capitulo que alguien espera (prioridad <= 10) lleva mas de {@code minutos} sin empezar. */
    boolean vozUrgenteAtascada(int minutos);

    // ------------------------------------------------------------------ B17: diccionario de pronunciacion

    /** (voz_id, capitulo) de los audios LISTO de ese archivo. */
    java.util.List<Map<String, Object>> audiosListos(UUID archivoId);

    /** (voz_id, capitulo) de los trabajos de voz EN_CURSO con latido de ese archivo (se generan con el diccionario viejo). */
    java.util.List<Map<String, Object>> vozEnCurso(UUID archivoId);

    /** Los trabajos de voz PENDIENTES del archivo pasan a llevar el diccionario actual. Devuelve cuantos. */
    int actualizarPronunciacionEnCola(UUID archivoId);

    /**
     * Encola la regeneracion de un capitulo (payload con "regenerar": true y el
     * diccionario actual) si no hay ya uno PENDIENTE de ese capitulo y voz. El
     * estado de bah_lib_audio NO cambia: el audio viejo sigue LISTO y sonando
     * hasta que el taller deja el nuevo. true si lo encolo.
     */
    boolean encolarRegeneracion(UUID archivoId, String vozId, int capitulo);

    /** Trabajos de regeneracion vivos (PENDIENTE o EN_CURSO con latido) de ese archivo. */
    int regenerando(UUID archivoId);
}
