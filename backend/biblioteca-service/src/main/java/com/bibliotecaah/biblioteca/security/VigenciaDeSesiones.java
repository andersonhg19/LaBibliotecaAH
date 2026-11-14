package com.bibliotecaah.biblioteca.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ¿Sigue valiendo este token? (QA SE-02)
 *
 * La firma solo dice que auth-service lo emitio; no que la cuenta siga activa
 * ni que su version de sesion ("ver") no haya subido (desactivacion, roles,
 * clave). Eso lo sabe auth-service, asi que se le pregunta con el MISMO token a
 * POST /v1/auth/sesion: 200 = vigente, 401 = revocado.
 *
 * POR QUE PREGUNTAR Y NO LEER LA BASE: auth_db es de auth-service; leerla desde
 * aqui ataria los dos esquemas. La respuesta se guarda en cache por
 * (usuario, version, huella del token):
 *  · vigente: {@code cacheSegundos} (30 s por defecto). Es el retraso maximo
 *    con el que una desactivacion se nota aqui; en auth-service es inmediato.
 *  · revocada: 10 min (la version solo sube; una revocada no vuelve).
 *  · auth-service no responde, o responde un 401 que NO es suyo de rechazo de
 *    token (p. ej. el «Necesitas iniciar sesión» de su entry point, que sale
 *    cuando el token ni le llego): se deja pasar (la firma ya se comprobo) y se
 *    reintenta a los 5 s, con WARN en el log. Que auth tropiece no debe tumbar
 *    la lectura; la revocacion es una defensa ADEMAS de la firma y la caducidad.
 *
 * Validacion web 0.4.0 (V-NUEVO-2): la clave era solo (usuario, version), asi que
 * UN token rechazado (manipulado, o un tropiezo de auth) dejaba fuera 10 min a
 * TODOS los dispositivos de la cuenta. Ahora la clave lleva la huella del token
 * (sha256 truncado; el token en claro no se guarda ni se registra) y cada token
 * responde de lo suyo. Ademas, las preguntas iguales en vuelo se agrupan: una
 * rafaga de peticiones con el mismo token al caducar la cache hace UNA sola
 * llamada a auth, no una por peticion.
 */
@Slf4j
@Component
public class VigenciaDeSesiones {

    static final Duration SI_REVOCADA = Duration.ofMinutes(10);
    static final Duration SI_NO_RESPONDE = Duration.ofSeconds(5);
    static final String RUTA = "/biblioteca/v1/auth/sesion";
    /** El texto del entry point de auth-service (SecurityConfig.SIN_SESION): el token no le llego. */
    static final String AUTH_SIN_SESION = "Necesitas iniciar sesi";
    private static final int MAXIMO_EN_CACHE = 10_000;
    private static final int MAXIMO_CUERPO_EN_LOG = 160;

    private record Entrada(boolean vigente, Instant hasta) { }

    private final RestClient auth;
    private final boolean activa;
    private final Duration siVigente;
    private final Clock reloj;
    private final Map<String, Entrada> cache = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<Entrada>> enVuelo = new ConcurrentHashMap<>();

    @Autowired
    public VigenciaDeSesiones(@Qualifier("clienteDeAuth") RestClient auth,
                              @Value("${biblioteca.sesion.verificar:true}") boolean activa,
                              @Value("${biblioteca.sesion.cache-segundos:30}") long cacheSegundos) {
        this(auth, activa, Duration.ofSeconds(cacheSegundos), Clock.systemUTC());
    }

    VigenciaDeSesiones(RestClient auth, boolean activa, Duration siVigente, Clock reloj) {
        this.auth = auth;
        this.activa = activa;
        this.siVigente = siVigente;
        this.reloj = reloj;
    }

    public boolean vigente(Long userId, Integer version, String token) {
        if (!activa) return true;
        String clave = clave(userId, version, token);
        Entrada guardada = cache.get(clave);
        if (guardada != null && reloj.instant().isBefore(guardada.hasta())) {
            return guardada.vigente();
        }
        /* Una sola pregunta en vuelo por clave: la primera la hace, las demas esperan su respuesta. */
        CompletableFuture<Entrada> mia = new CompletableFuture<>();
        CompletableFuture<Entrada> enCurso = enVuelo.putIfAbsent(clave, mia);
        if (enCurso != null) {
            return enCurso.join().vigente();
        }
        try {
            Entrada nueva = preguntar(userId, token);
            Instant ahora = reloj.instant();
            if (cache.size() > MAXIMO_EN_CACHE) {
                cache.entrySet().removeIf(e -> !ahora.isBefore(e.getValue().hasta()));
            }
            cache.put(clave, nueva);
            mia.complete(nueva);
            return nueva.vigente();
        } finally {
            enVuelo.remove(clave, mia);
            /* Si algo inesperado reviento arriba, quien espera no se queda colgado: pasa con la firma,
               como cuando auth no responde (sin efecto si ya se completo). */
            mia.complete(new Entrada(true, Instant.EPOCH));
        }
    }

    /** (usuario, version, sha256 del token truncado a 16 hex). El token en claro no sale de aqui. */
    static String clave(Long userId, Integer version, String token) {
        return userId + ":" + (version == null ? 0 : version) + ":" + huella(token);
    }

    static String huella(String token) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(
                    (token == null ? "" : token).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h, 0, 8);
        } catch (NoSuchAlgorithmException imposible) {
            /* Toda JVM trae SHA-256 (exigido por la especificacion de Java). */
            throw new IllegalStateException(imposible);
        }
    }

    private Entrada preguntar(Long userId, String token) {
        try {
            auth.post().uri(RUTA).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve().toBodilessEntity();
            return new Entrada(true, reloj.instant().plus(siVigente));
        } catch (HttpClientErrorException.Unauthorized rechazo) {
            String cuerpo = resumen(rechazo.getResponseBodyAsString(StandardCharsets.UTF_8));
            if (cuerpo.contains(AUTH_SIN_SESION)) {
                /* auth no vio el token (su entry point): no es una revocacion. */
                log.warn("auth-service respondio 401 sin ver el token (usuario {}, token {}): {} {}; se deja pasar "
                        + "con la firma", userId, huella(token), rechazo.getStatusCode().value(), cuerpo);
                return new Entrada(true, reloj.instant().plus(SI_NO_RESPONDE));
            }
            log.warn("Sesion revocada en auth-service (usuario {}, token {}): {} {}",
                    userId, huella(token), rechazo.getStatusCode().value(), cuerpo);
            return new Entrada(false, reloj.instant().plus(SI_REVOCADA));
        } catch (RuntimeException sinRespuesta) {
            log.warn("auth-service no confirmo la sesion del usuario {} ({}); se deja pasar con la firma",
                    userId, sinRespuesta.getMessage());
            return new Entrada(true, reloj.instant().plus(SI_NO_RESPONDE));
        }
    }

    /** El cuerpo de error en una linea y corto (es el ResultDTO de auth; nunca lleva el token). */
    static String resumen(String cuerpo) {
        if (cuerpo == null || cuerpo.isBlank()) return "(sin cuerpo)";
        String linea = cuerpo.replaceAll("\\s+", " ").trim();
        return linea.length() > MAXIMO_CUERPO_EN_LOG ? linea.substring(0, MAXIMO_CUERPO_EN_LOG) + "…" : linea;
    }
}
