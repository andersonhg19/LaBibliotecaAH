package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * La identidad de quien pide, tomada del token y de ningun otro sitio.
 * Regla del proyecto: ningun endpoint acepta userId en el cuerpo.
 */
public final class SecurityUtils {

    private SecurityUtils() {}

    public static Long getAuthenticatedUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return null;
        Object detalles = auth.getDetails();
        return (detalles instanceof Long id) ? id : null;
    }

    /** El usuario del token; si no hay (token sin claim userId), error 401. */
    public static Long usuarioActual() {
        Long id = getAuthenticatedUserId();
        if (id == null) {
            throw new ValidationException(Message.Msj.sesionSinUsuario, CodigoError.NO_AUTENTICADO);
        }
        return id;
    }
}
