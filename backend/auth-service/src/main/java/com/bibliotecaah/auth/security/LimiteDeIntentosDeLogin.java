package com.bibliotecaah.auth.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limite de intentos de login fallidos por correo (QA M7).
 *
 * Antes se podian probar 30 contrasenas en 3 segundos sin freno. Ahora, con
 * MAX_FALLOS fallos dentro de VENTANA, ese correo queda bloqueado hasta que el
 * fallo mas viejo salga de la ventana; un login correcto borra la cuenta.
 *
 * VIVE EN MEMORIA a proposito: la app corre en una sola instancia y perder los
 * contadores al reiniciar es aceptable (como mucho, un atacante gana un
 * reinicio). Si algun dia hay varias instancias, esto tiene que pasar a una
 * tabla o a Redis.
 *
 * POR CORREO Y NO POR IP: detras del gateway, la IP que ve este servicio es la
 * del gateway, la misma para todo el mundo; limitar por ella bloquearia a
 * todos los usuarios a la vez, y la cabecera X-Forwarded-For la puede inventar
 * el cliente. El precio conocido: alguien que sepa tu correo puede dejarte
 * fuera unos minutos fallando a proposito. Es un bloqueo corto y se acepta.
 *
 * El reloj se inyecta para poder probar la ventana sin dormir hilos.
 */
@Slf4j
@Component
public class LimiteDeIntentosDeLogin {

    static final int MAX_FALLOS = 5;
    static final Duration VENTANA = Duration.ofMinutes(5);

    /** Por encima de este tamano se barren las entradas caducadas. */
    private static final int LIMPIAR_DESDE = 10_000;

    private final Clock reloj;
    private final Map<String, Deque<Instant>> fallosPorCorreo = new ConcurrentHashMap<>();

    @Autowired
    public LimiteDeIntentosDeLogin() {
        this(Clock.systemUTC());
    }

    public LimiteDeIntentosDeLogin(Clock reloj) {
        this.reloj = reloj;
    }

    /** ¿Ese correo ya agoto sus intentos dentro de la ventana? */
    public boolean estaBloqueado(String correo) {
        String clave = clave(correo);
        if (clave == null) return false;
        Deque<Instant> fallos = fallosPorCorreo.get(clave);
        if (fallos == null) return false;
        synchronized (fallos) {
            purgar(fallos);
            return fallos.size() >= MAX_FALLOS;
        }
    }

    public void registrarFallo(String correo) {
        String clave = clave(correo);
        if (clave == null) return;
        if (fallosPorCorreo.size() > LIMPIAR_DESDE) {
            barrerCaducados();
        }
        Deque<Instant> fallos = fallosPorCorreo.computeIfAbsent(clave, k -> new ArrayDeque<>());
        synchronized (fallos) {
            purgar(fallos);
            fallos.addLast(reloj.instant());
            if (fallos.size() == MAX_FALLOS) {
                log.warn("Login bloqueado temporalmente por {} fallos seguidos: {}", MAX_FALLOS, clave);
            }
        }
    }

    public void registrarExito(String correo) {
        String clave = clave(correo);
        if (clave != null) {
            fallosPorCorreo.remove(clave);
        }
    }

    private void purgar(Deque<Instant> fallos) {
        Instant limite = reloj.instant().minus(VENTANA);
        while (!fallos.isEmpty() && !fallos.peekFirst().isAfter(limite)) {
            fallos.pollFirst();
        }
    }

    private void barrerCaducados() {
        fallosPorCorreo.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                purgar(e.getValue());
                return e.getValue().isEmpty();
            }
        });
    }

    /* Sin distinguir mayusculas ni espacios: si no, "ANA@x.com" y "ana@x.com"
       serian dos contadores y el limite se saltaria cambiando una letra. */
    private static String clave(String correo) {
        if (correo == null || correo.isBlank()) return null;
        return correo.trim().toLowerCase(Locale.ROOT);
    }
}
