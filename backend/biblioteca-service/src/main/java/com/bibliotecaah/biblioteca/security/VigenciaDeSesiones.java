package com.bibliotecaah.biblioteca.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
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
 * aqui ataria los dos esquemas. La pregunta se guarda en cache por (usuario,
 * version):
 *  · vigente: {@code cacheSegundos} (30 s por defecto). Es el retraso maximo
 *    con el que una desactivacion se nota aqui; en auth-service es inmediato.
 *    Con dos usuarios son, como mucho, un par de peticiones cada 30 s.
 *  · revocada: 10 min (la version solo sube; una revocada no vuelve).
 *  · auth-service no responde: se deja pasar (la firma ya se comprobo) y se
 *    reintenta a los 5 s, con WARN en el log. Que auth caiga no debe tumbar la
 *    lectura; la revocacion es una defensa ADEMAS de la firma y la caducidad.
 */
@Slf4j
@Component
public class VigenciaDeSesiones {

    static final Duration SI_REVOCADA = Duration.ofMinutes(10);
    static final Duration SI_NO_RESPONDE = Duration.ofSeconds(5);
    static final String RUTA = "/biblioteca/v1/auth/sesion";
    private static final int MAXIMO_EN_CACHE = 10_000;

    private record Entrada(boolean vigente, Instant hasta) { }

    private final RestClient auth;
    private final boolean activa;
    private final Duration siVigente;
    private final Clock reloj;
    private final Map<String, Entrada> cache = new ConcurrentHashMap<>();

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
        String clave = userId + ":" + (version == null ? 0 : version);
        Instant ahora = reloj.instant();
        Entrada guardada = cache.get(clave);
        if (guardada != null && ahora.isBefore(guardada.hasta())) {
            return guardada.vigente();
        }
        Entrada nueva = preguntar(userId, token, ahora);
        if (cache.size() > MAXIMO_EN_CACHE) {
            cache.entrySet().removeIf(e -> !ahora.isBefore(e.getValue().hasta()));
        }
        cache.put(clave, nueva);
        return nueva.vigente();
    }

    private Entrada preguntar(Long userId, String token, Instant ahora) {
        try {
            auth.post().uri(RUTA).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve().toBodilessEntity();
            return new Entrada(true, ahora.plus(siVigente));
        } catch (HttpClientErrorException.Unauthorized revocada) {
            log.info("Sesion revocada en auth-service (usuario {}): token rechazado", userId);
            return new Entrada(false, ahora.plus(SI_REVOCADA));
        } catch (RuntimeException sinRespuesta) {
            log.warn("auth-service no confirmo la sesion del usuario {} ({}); se deja pasar con la firma",
                    userId, sinRespuesta.getMessage());
            return new Entrada(true, ahora.plus(SI_NO_RESPONDE));
        }
    }
}
