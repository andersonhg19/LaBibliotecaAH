package com.bibliotecaah.auth.util;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * La identidad de quien hace la peticion, tomada del token y de ningun otro
 * sitio.
 *
 * Esta clase existia desde el principio pero NO la usaba nadie: el userId
 * llegaba en el cuerpo de cada peticion. Eso convertia la identidad en un
 * parametro mas —indistinguible de categoryId o de amount— y cualquiera podia
 * leer o modificar los datos de otro cambiando un numero.
 *
 * Regla del proyecto: ningun servicio vuelve a aceptar un userId de entrada.
 * Si necesitas saber quien pide algo, se pregunta aqui.
 *
 * Desde la ola 4 responde tambien a la segunda pregunta —que puede hacer— con
 * los roles que vienen firmados en el token.
 */
public final class SecurityUtils {

    public static final String ROL_ADMIN = "ADMIN";
    public static final String ROL_USER = "USER";

    private SecurityUtils() {}

    public static String getAuthenticatedEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : null;
    }

    /**
     * Id del usuario autenticado, o null si no hay token. Devolver null y no
     * lanzar es a proposito: quien llame decide si eso es un 401 o un flujo
     * publico, y asi esta clase no impone politica.
     */
    public static Long getAuthenticatedUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return null;
        Object detalles = auth.getDetails();
        return (detalles instanceof Long) ? (Long) detalles : null;
    }

    /**
     * ¿El recurso es de quien lo pide? Un null en el dueno se trata como "no",
     * nunca como "si": un dato sin dueno no es de todos.
     */
    public static boolean esDelUsuario(Long duenoDelRecurso) {
        Long yo = getAuthenticatedUserId();
        return yo != null && yo.equals(duenoDelRecurso);
    }

    /**
     * ¿Quien pide esto lleva el rol indicado?
     *
     * La respuesta sale de las autoridades que el filtro JWT saco del token, no
     * de una consulta a la base: el rol lo firma auth-service al emitirlo. Sin
     * token no hay rol, y eso se responde "no" —igual que arriba, la ausencia
     * de dato nunca concede.
     */
    public static boolean tieneRol(String nombreDelRol) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null || nombreDelRol == null) return false;
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(nombreDelRol::equals);
    }

    public static boolean esAdmin() {
        return tieneRol(ROL_ADMIN);
    }

    /**
     * ¿Puede tocar este recurso? Es suyo, o es administrador.
     *
     * Existe para que la excepcion del administrador se escriba UNA vez y no
     * quince: la alternativa es un "|| SecurityUtils.esAdmin()" repartido por
     * los servicios, y ese es exactamente el patron que se olvida en el sitio
     * numero dieciseis.
     */
    public static boolean puedeAcceder(Long duenoDelRecurso) {
        return esDelUsuario(duenoDelRecurso) || esAdmin();
    }
}
