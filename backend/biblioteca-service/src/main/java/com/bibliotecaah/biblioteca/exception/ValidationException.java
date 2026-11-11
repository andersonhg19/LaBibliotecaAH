package com.bibliotecaah.biblioteca.exception;

import com.bibliotecaah.biblioteca.enums.Message;
import lombok.Getter;

/**
 * Un "no" de negocio o de validacion. El @RestControllerAdvice global lo
 * traduce a ResultDTO(correct=false) con HTTP 200, el texto de
 * messages_es.properties y el errorCode del catalogo
 * (documentación/codigos-de-error.md).
 */
@Getter
public class ValidationException extends RuntimeException {

    private final transient Message.Msj clave;
    private final int codigo;
    private final transient Object[] argumentos;

    public ValidationException(Message.Msj clave, int codigo, Object... argumentos) {
        super(clave.name());
        this.clave = clave;
        this.codigo = codigo;
        this.argumentos = argumentos;
    }
}
