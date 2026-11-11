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

    private CodigoError() {}
}
