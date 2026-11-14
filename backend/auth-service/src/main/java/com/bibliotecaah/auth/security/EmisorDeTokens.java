package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Date;
import java.util.List;

/**
 * El unico sitio que firma tokens: login, renovacion y cambio de contrasena.
 *
 * Claims: sub (correo), userId, name, roles (solo los activos) y, desde V4,
 * "ver" = version de sesion de la cuenta (QA SE-02). Siempre con exp y, desde
 * 0.4.0 (auditoria BK-08), con iat: permite un dia invalidar "lo emitido antes de X".
 */
@Component
public class EmisorDeTokens {

    public static final String CLAIM_VERSION = "ver";

    private final SecParams secParams;
    private final Clock reloj;

    @org.springframework.beans.factory.annotation.Autowired
    public EmisorDeTokens(SecParams secParams) {
        this(secParams, Clock.systemUTC());
    }

    EmisorDeTokens(SecParams secParams, Clock reloj) {
        this.secParams = secParams;
        this.reloj = reloj;
    }

    /** Roles que se firman: los activos, ordenados. */
    public static List<String> rolesActivos(User user) {
        return user.getRoles().stream()
                .filter(rol -> Boolean.TRUE.equals(rol.getActive()))
                .map(Role::getName)
                .sorted()
                .toList();
    }

    public String emitir(User user, List<String> roles) {
        return JWT.create()
                .withSubject(user.getEmail())
                .withClaim("userId", user.getId())
                .withClaim("name", user.getName())
                .withArrayClaim("roles", roles.toArray(new String[0]))
                .withClaim(CLAIM_VERSION, user.getVersionSesion() == null ? 0 : user.getVersionSesion())
                .withIssuedAt(new Date(reloj.millis()))
                .withExpiresAt(new Date(reloj.millis() + secParams.getExpiredTime()))
                .sign(Algorithm.HMAC256(secParams.getSecret()));
    }
}
