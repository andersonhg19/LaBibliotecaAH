package com.bibliotecaah.biblioteca.util;

/** Catalogo de errorCode (documentación/codigos-de-error.md). */
public final class CodigoError {

    public static final int OK = 0;
    public static final int DUPLICADO = 101;
    public static final int NO_ENCONTRADO = 102;
    public static final int ERROR_DE_PROCESO = 103;
    public static final int DATO_INVALIDO = 120;
    public static final int NO_AUTENTICADO = 401;
    public static final int SIN_PERMISO = 403;
    public static final int ALMACEN_NO_DISPONIBLE = 503;
    /** Subida por encima de los topes (archivos por peticion, tamano). QA SE-07. */
    public static final int DEMASIADO_GRANDE = 413;
    /** No queda espacio libre en /datos. QA SE-07. */
    public static final int SIN_ESPACIO = 507;
    /** (v1.3) Demasiado texto a traducir en poco tiempo, o el traductor ya tiene la cola llena. */
    public static final int DEMASIADAS_PETICIONES = 429;
    /** (v1.3) El traductor no responde: mismo numero que el almacen, otro mensaje. */
    public static final int SERVICIO_NO_DISPONIBLE = 503;

    private CodigoError() {}
}
