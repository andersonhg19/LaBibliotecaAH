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
        deseoSoloConArchivo,
        deseoUnSoloArchivo,
        noEsUnDeseo,
        rutaInvalida,
        rutaNoEncontrada,
        metodoNoPermitido,
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
        originalNoGuardado,
        // Ola de arreglos de QA (seguridad, biblioteca, datos).
        demasiadosArchivos,
        sinEspacio,
        demasiadosEstantes,
        yaLoTenias,
        vozNoDisponible,
        valorFueraDeRango,
        conflictoConcurrente,
        contenidoNoSoportado,
        // Traduccion (contratos v1.3).
        traductorNoDisponible,
        idiomaNoSoportado,
        mismoIdioma,
        demasiadoTextoTraducido,
        demasiadosCapitulosTraducidos,
        traductorOcupado,
        libroAunSinConvertir,
        capituloSinTexto,
        traduccionFallida,
        // Carpetas del archivador (contratos v1.6).
        carpetaNoEncontrada,
        carpetaDuplicada,
        carpetaDentroDeSiMisma,
        carpetaDemasiadoProfunda,
        demasiadasCarpetas,
        carpetaSoloDocumentos,
        soloDocumentosEnCarpetas,
        carpetaNoVacia,
        // 0.4.0: sesiones de lectura y estado de la casa.
        sesionAjena,
        capitulosNoDisponibles,
        rangoDeFechasInvalido,
        casaDiscoDesconectado,
        casaTallerCaido,
        casaTallerLento,
        casaTraductorCaido,
        // B17: diccionario de pronunciacion por libro.
        demasiadasPronunciaciones,
        pronunciacionInvalida,
        pronunciacionDuplicada
    }
}
