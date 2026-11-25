package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.exception.ValidationException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.regex.Pattern;

/** Validaciones centralizadas; todas lanzan ValidationException. */
public final class ValidationUtils {

    /** Ids de voz y nombres de carpeta: sin barras ni "..". */
    private static final Pattern ID_SEGURO = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$");

    private ValidationUtils() {}

    public static void exigir(boolean condicion, Message.Msj clave, int codigo, Object... argumentos) {
        if (!condicion) throw new ValidationException(clave, codigo, argumentos);
    }

    public static <T> T encontrado(Optional<T> valor, Message.Msj clave) {
        return valor.orElseThrow(() -> new ValidationException(clave, CodigoError.NO_ENCONTRADO));
    }

    /** 0.5 a 5 en pasos de 0.5. Nulo = sin calificar (valido). */
    public static BigDecimal calificacion(Double valor) {
        if (valor == null) return null;
        boolean valida = valor >= 0.5 && valor <= 5 && Math.abs(valor * 2 - Math.rint(valor * 2)) < 1e-9;
        exigir(valida, Message.Msj.calificacionInvalida, CodigoError.DATO_INVALIDO);
        return BigDecimal.valueOf(valor).setScale(1, java.math.RoundingMode.HALF_UP);
    }

    public static boolean idSeguro(String valor) {
        return valor != null && !valor.contains("..") && ID_SEGURO.matcher(valor).matches();
    }

    public static String vozId(String valor) {
        exigir(idSeguro(valor), Message.Msj.vozInvalida, CodigoError.DATO_INVALIDO, valor);
        return valor;
    }

    /**
     * (0.5.0, C11) El archivo del ejemplar, o 120 con un mensaje claro si no tiene: un deseo ("Este libro no
     * tiene archivo.") o un libro solo registro ("... es solo registro."). Todo sitio que necesita el archivo
     * (voz, preparar, capitulos en voz, pronunciacion, traduccion) pasa por aqui: nunca un 500.
     */
    public static Archivo archivoDe(Ejemplar e) {
        if (e.getArchivo() != null) return e.getArchivo();
        throw new ValidationException(e.getTipo() == TipoEjemplar.DESEO ? Message.Msj.libroSinArchivo
                : Message.Msj.libroSoloRegistro, CodigoError.DATO_INVALIDO);
    }
}
