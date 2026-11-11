package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Las reglas del alias en un solo sitio: lo usan el registro publico, el
 * guardado de la propia cuenta y el de administracion.
 *
 * Devuelve el problema (un ResultDTO de error listo para responder) o nada si
 * el alias sirve. La unicidad se comprueba contra TODAS las cuentas, activas o
 * no, porque la restriccion unica de la base tampoco distingue: una cuenta
 * desactivada conserva su alias y puede reactivarse.
 */
@Component
public class ValidacionDeAlias {

    /** errorCode de "datos invalidos" en auth-service (codigos-de-error.md). */
    public static final int DATO_INVALIDO = 400;
    /** errorCode de "alias no disponible" (codigos-de-error.md). */
    public static final int ALIAS_NO_DISPONIBLE = 112;

    private final UserRepository usuarios;
    private final Mensajes mensajes;

    public ValidacionDeAlias(UserRepository usuarios, Mensajes mensajes) {
        this.usuarios = usuarios;
        this.mensajes = mensajes;
    }

    /**
     * @param alias      lo que llego, sin normalizar
     * @param idDeCuenta la cuenta que lo va a llevar (null si es una cuenta nueva)
     */
    public Optional<ResultDTO> problema(String alias, Long idDeCuenta) {
        String normalizado = ValidationUtils.normalizarAlias(alias);
        if (normalizado == null) {
            return Optional.of(ValidationUtils.error(mensajes.texto(Message.Msj.aliasObligatorio), DATO_INVALIDO));
        }
        if (!ValidationUtils.esAliasValido(normalizado)) {
            return Optional.of(ValidationUtils.error(mensajes.texto(Message.Msj.aliasInvalido), DATO_INVALIDO));
        }
        boolean ocupado = idDeCuenta == null
                ? usuarios.existsByAlias(normalizado)
                : usuarios.existsByAliasAndIdNot(normalizado, idDeCuenta);
        if (ocupado) {
            return Optional.of(ValidationUtils.error(mensajes.texto(Message.Msj.aliasNoDisponible), ALIAS_NO_DISPONIBLE));
        }
        return Optional.empty();
    }
}
