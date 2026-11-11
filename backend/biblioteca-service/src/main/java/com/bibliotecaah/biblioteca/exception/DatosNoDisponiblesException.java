package com.bibliotecaah.biblioteca.exception;

import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.util.CodigoError;

/** La carpeta /datos no esta montada o no responde (disco USB desconectado). */
public class DatosNoDisponiblesException extends ValidationException {

    public DatosNoDisponiblesException() {
        super(Message.Msj.datosNoDisponibles, CodigoError.ALMACEN_NO_DISPONIBLE);
    }
}
