package com.bibliotecaah.auth.security;

import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * De "lo que la persona escribio en la casilla de usuario" a "que cuenta es".
 *
 * Se puede entrar con el correo O con el alias (V3):
 *   · con @  -> es un correo: sin distinguir mayusculas y sin espacios alrededor;
 *   · sin @  -> es un alias: el alias se guarda en minusculas y no admite @, asi
 *               que no hay ambiguedad posible entre las dos formas.
 *
 * Solo cuentas ACTIVAS: una desactivada no entra ni por una via ni por la otra.
 *
 * La misma resolucion la usan MyUserDetailsService (para comprobar la clave) y
 * AuthenticationServiceImpl (para el limite de intentos y el token): si cada
 * uno buscara a su manera, el limite podria contar a una cuenta y la clave
 * comprobarse contra otra.
 */
@Component
public class IdentidadDeLogin {

    private final UserRepository usuarios;

    public IdentidadDeLogin(UserRepository usuarios) {
        this.usuarios = usuarios;
    }

    /** Recortado y en minusculas; null si no hay nada que buscar. */
    public static String normalizar(String identificador) {
        if (identificador == null || identificador.isBlank()) return null;
        return identificador.trim().toLowerCase(Locale.ROOT);
    }

    public Optional<User> buscarActiva(String identificador) {
        String normalizado = normalizar(identificador);
        if (normalizado == null) return Optional.empty();
        if (normalizado.indexOf('@') < 0) {
            return usuarios.findByAliasAndActiveTrue(normalizado);
        }
        /* Primero tal cual se escribio (recortado): es el caso de siempre y el
           unico que desempata si hay dos correos que solo difieren en
           mayusculas (la base los permite). Si no, sin distinguir mayusculas,
           pero solo si la coincidencia es UNICA: entre dos candidatos no se
           elige uno al azar. */
        Optional<User> exacta = usuarios.findByEmailAndActiveTrue(identificador.trim());
        if (exacta.isPresent()) return exacta;
        List<User> candidatas = usuarios.buscarActivosPorCorreoSinMayusculas(normalizado);
        return candidatas.size() == 1 ? Optional.of(candidatas.get(0)) : Optional.empty();
    }

    /**
     * Con que clave cuenta el limite de intentos. Por la CUENTA cuando existe:
     * asi alternar correo y alias de la misma persona no reparte los fallos en
     * dos contadores. Si no hay cuenta, por el identificador normalizado (sin
     * esto, probar contra un usuario inexistente no tendria freno).
     */
    public static String claveDelLimite(String identificador, Optional<User> cuenta) {
        if (cuenta.isPresent()) {
            return "cuenta:" + cuenta.get().getId();
        }
        String normalizado = normalizar(identificador);
        return normalizado == null ? null : "identificador:" + normalizado;
    }
}
