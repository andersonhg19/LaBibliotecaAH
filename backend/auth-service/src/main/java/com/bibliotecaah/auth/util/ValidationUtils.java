package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.dto.output.ResultDTO;

import java.util.Locale;
import java.util.regex.Pattern;

public final class ValidationUtils {

    /**
     * Formato del alias (V3): 3 a 30 caracteres, letras minusculas sin tilde,
     * digitos, punto, guion y guion bajo. Sin @ por construccion: asi un
     * identificador de login con @ es siempre un correo y sin @ siempre un alias.
     * La web valida con la misma expresion (frontend/src/validaciones).
     */
    public static final String FORMATO_ALIAS = "^[a-z0-9._-]{3,30}$";

    private static final Pattern ALIAS = Pattern.compile(FORMATO_ALIAS);

    private ValidationUtils() {}

    public static ResultDTO error(String message, int errorCode) {
        return new ResultDTO(false, message, errorCode);
    }

    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** Recortado y en minusculas; null si no hay nada. Es la forma en que se guarda. */
    public static String normalizarAlias(String alias) {
        return isBlank(alias) ? null : alias.trim().toLowerCase(Locale.ROOT);
    }

    /** ¿Cumple el formato? Recibe el alias YA normalizado. */
    public static boolean esAliasValido(String aliasNormalizado) {
        return aliasNormalizado != null && ALIAS.matcher(aliasNormalizado).matches();
    }

    /** Correo recortado y en minusculas (QA SE-04): la forma en que se guarda y se busca. */
    public static String normalizarCorreo(String correo) {
        return isBlank(correo) ? correo : correo.trim().toLowerCase(Locale.ROOT);
    }

    /** Claves que no se aceptan aunque cumplan longitud, letra y numero (QA SE-09). */
    private static final java.util.Set<String> CLAVES_COMUNES = java.util.Set.of(
            "1234567890", "123456789a", "a123456789", "password1", "password12", "password123",
            "contrasena1", "contrasena123", "qwerty1234", "qwertyuiop1", "abcdefghi1", "abc1234567",
            "biblioteca1", "biblioteca123", "iloveyou12", "admin12345", "12345678910");

    /**
     * ¿Es una clave demasiado facil (QA SE-09)? Menos de 10 caracteres, espacios
     * al principio o al final, menos de 5 caracteres distintos ("aaaaaaaaa1") o
     * una de las claves mas comunes. La longitud, la letra y el numero ya los
     * exige la validacion del DTO; aqui se repite la longitud por si llega por
     * otra via.
     */
    public static boolean esClaveDebil(String clave) {
        if (clave == null || clave.length() < 10) return true;
        if (!clave.equals(clave.strip())) return true;
        if (clave.chars().distinct().count() < 5) return true;
        return CLAVES_COMUNES.contains(clave.toLowerCase(Locale.ROOT));
    }
}
