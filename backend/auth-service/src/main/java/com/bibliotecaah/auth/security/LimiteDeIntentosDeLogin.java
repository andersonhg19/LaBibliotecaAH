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
 * Frenos del login (QA M7, SE-08). Tres contadores de fallos con ventana
 * deslizante; basta con que uno este lleno para responder 429:
 *
 *  1. POR CUENTA Y ORIGEN: MAX_FALLOS fallos en VENTANA. La identidad la
 *     decide IdentidadDeLogin.claveDelLimite (la cuenta si existe; asi correo y
 *     alias de la misma persona suman juntos).
 *  2. POR ORIGEN: MAX_FALLOS_ORIGEN fallos en VENTANA_ORIGEN contra cualquier
 *     cuenta. Frena el barrido de contrasenas (spraying) desde un dispositivo.
 *  3. GLOBAL: MAX_FALLOS_GLOBAL fallos en VENTANA_GLOBAL sumando todo. Ultima
 *     red contra un barrido desde muchos origenes; el umbral es alto para que el
 *     uso normal de dos personas no lo roce.
 *
 * POR QUE CUENTA+ORIGEN Y NO SOLO CUENTA (SE-08): con solo la cuenta, quien
 * supiera tu correo te dejaba fuera indefinidamente fallando cada pocos
 * minutos. Con el origen en la clave, los fallos de otro dispositivo no te
 * bloquean a ti. El origen lo calcula OrigenDeLaPeticion a partir de
 * X-Forwarded-For contando solo los saltos de proxies de confianza (Tailscale
 * serve y el gateway), asi que el cliente no puede inventarselo. Sin origen
 * (llamada directa) todos comparten "desconocido" y el freno vuelve a ser por
 * cuenta, el comportamiento anterior.
 *
 * VIVE EN MEMORIA a proposito: una sola instancia; perder los contadores al
 * reiniciar es aceptable. Con varias instancias tendria que ir a una tabla.
 *
 * El reloj se inyecta para poder probar las ventanas sin dormir hilos.
 */
@Slf4j
@Component
public class LimiteDeIntentosDeLogin {

    static final int MAX_FALLOS = 5;
    static final Duration VENTANA = Duration.ofMinutes(5);
    static final int MAX_FALLOS_ORIGEN = 20;
    static final Duration VENTANA_ORIGEN = Duration.ofMinutes(10);
    static final int MAX_FALLOS_GLOBAL = 60;
    static final Duration VENTANA_GLOBAL = Duration.ofMinutes(1);

    static final String SIN_ORIGEN = "desconocido";
    private static final String GLOBAL = "global";

    /** Por encima de este tamano se barren las entradas caducadas. */
    private static final int LIMPIAR_DESDE = 10_000;

    private final Clock reloj;
    private final Map<String, Deque<Instant>> porCuenta = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> porOrigen = new ConcurrentHashMap<>();
    private final Deque<Instant> global = new ArrayDeque<>();

    @Autowired
    public LimiteDeIntentosDeLogin() {
        this(Clock.systemUTC());
    }

    public LimiteDeIntentosDeLogin(Clock reloj) {
        this.reloj = reloj;
    }

    // ---------------------------------------------------------------- sin origen

    public boolean estaBloqueado(String identidad) {
        return estaBloqueado(identidad, null);
    }

    public void registrarFallo(String identidad) {
        registrarFallo(identidad, null);
    }

    public void registrarExito(String identidad) {
        registrarExito(identidad, null);
    }

    // ---------------------------------------------------------------- con origen

    /** ¿Esa identidad, desde ese origen, tiene que esperar? */
    public boolean estaBloqueado(String identidad, String origen) {
        String o = origen(origen);
        if (lleno(global, MAX_FALLOS_GLOBAL, VENTANA_GLOBAL)) return true;
        if (lleno(porOrigen.get(o), MAX_FALLOS_ORIGEN, VENTANA_ORIGEN)) return true;
        String clave = clave(identidad, o);
        return clave != null && lleno(porCuenta.get(clave), MAX_FALLOS, VENTANA);
    }

    public void registrarFallo(String identidad, String origen) {
        String o = origen(origen);
        if (porCuenta.size() > LIMPIAR_DESDE || porOrigen.size() > LIMPIAR_DESDE) {
            barrerCaducados();
        }
        anotar(global, VENTANA_GLOBAL, MAX_FALLOS_GLOBAL, GLOBAL);
        anotar(porOrigen.computeIfAbsent(o, k -> new ArrayDeque<>()), VENTANA_ORIGEN, MAX_FALLOS_ORIGEN, "origen " + o);
        String clave = clave(identidad, o);
        if (clave != null) {
            anotar(porCuenta.computeIfAbsent(clave, k -> new ArrayDeque<>()), VENTANA, MAX_FALLOS, clave);
        }
    }

    /** Un login correcto pone a cero esa cuenta en ese origen (no los otros frenos). */
    public void registrarExito(String identidad, String origen) {
        String clave = clave(identidad, origen(origen));
        if (clave != null) {
            porCuenta.remove(clave);
        }
    }

    // ---------------------------------------------------------------- ayudas

    private boolean lleno(Deque<Instant> fallos, int maximo, Duration ventana) {
        if (fallos == null) return false;
        synchronized (fallos) {
            purgar(fallos, ventana);
            return fallos.size() >= maximo;
        }
    }

    private void anotar(Deque<Instant> fallos, Duration ventana, int maximo, String quien) {
        synchronized (fallos) {
            purgar(fallos, ventana);
            fallos.addLast(reloj.instant());
            if (fallos.size() == maximo) {
                log.warn("Login frenado temporalmente por {} fallos: {}", maximo, quien);
            }
        }
    }

    private void purgar(Deque<Instant> fallos, Duration ventana) {
        Instant limite = reloj.instant().minus(ventana);
        while (!fallos.isEmpty() && !fallos.peekFirst().isAfter(limite)) {
            fallos.pollFirst();
        }
    }

    private void barrerCaducados() {
        barrer(porCuenta, VENTANA);
        barrer(porOrigen, VENTANA_ORIGEN);
    }

    private void barrer(Map<String, Deque<Instant>> mapa, Duration ventana) {
        mapa.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                purgar(e.getValue(), ventana);
                return e.getValue().isEmpty();
            }
        });
    }

    private static String origen(String origen) {
        return origen == null || origen.isBlank() ? SIN_ORIGEN : origen.trim().toLowerCase(Locale.ROOT);
    }

    /* Sin distinguir mayusculas ni espacios: si no, "ANA@x.com" y "ana@x.com"
       serian dos contadores y el limite se saltaria cambiando una letra. */
    private static String clave(String identidad, String origen) {
        if (identidad == null || identidad.isBlank()) return null;
        return identidad.trim().toLowerCase(Locale.ROOT) + "|" + origen;
    }
}
