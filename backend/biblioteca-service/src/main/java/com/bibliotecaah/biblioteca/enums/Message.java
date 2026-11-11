package com.bibliotecaah.biblioteca.enums;

/**
 * Claves de los mensajes al usuario. El texto vive en messages_es.properties
 * (estandares §16): nada de textos escritos a mano en el codigo.
 */
public final class Message {

    private Message() {}

    public enum Msj {
        sesionSinUsuario,
        sesionInvalida,
        noAutenticado,
        sinPermiso,
        libroNoEncontrado,
        estanteNoEncontrado,
        anotacionNoEncontrada,
        comentarioNoEncontrado,
        archivoNoEncontrado,
        libroNoEstaEnEstante,
        referenciaNoEstaEnEstante,
        favoritosNoSeRenombra,
        favoritosNoSeBorra,
        estanteDuplicado,
        formatoNoSoportado,
        formatoNoCoincide,
        archivoVacio,
        sinArchivos,
        ningunArchivoAceptado,
        algunosRechazados,
        datosNoDisponibles,
        calificacionInvalida,
        deseoConArchivo,
        libroSinArchivo,
        capituloFueraDeRango,
        vozInvalida,
        datosInvalidos,
        campoValorInvalido,
        campoTipoInvalido,
        cuerpoInvalido,
        parametroFaltante,
        parametroInvalido,
        archivoDemasiadoGrande,
        subidaIncompleta,
        errorInesperado,
        progresoMasReciente,
        originalNoGuardado
    }
}
