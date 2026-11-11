package com.bibliotecaah.auth.security;

/**
 * El correo agoto sus intentos de login. No hereda de AuthenticationException
 * a proposito: no es un "credenciales malas" y no debe sumar otro fallo.
 */
public class DemasiadosIntentosException extends RuntimeException {

    public DemasiadosIntentosException() {
        super("Demasiados intentos fallidos de login");
    }
}
