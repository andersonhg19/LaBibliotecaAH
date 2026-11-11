package com.bibliotecaah.biblioteca.util;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ventana deslizante por usuario: como mucho {@code capacidad} unidades (caracteres, capitulos)
 * en cada {@code ventana}. En memoria: hay una sola instancia de biblioteca-service y dos
 * usuarios; si se reinicia, el contador vuelve a cero, que es inofensivo.
 */
public class LimitadorPorUsuario {

    private record Consumo(Instant cuando, long cantidad) { }

    private final long capacidad;
    private final Duration ventana;
    private final Clock reloj;
    private final Map<Long, Deque<Consumo>> consumos = new ConcurrentHashMap<>();

    public LimitadorPorUsuario(long capacidad, Duration ventana, Clock reloj) {
        this.capacidad = capacidad;
        this.ventana = ventana;
        this.reloj = reloj;
    }

    public long capacidad() {
        return capacidad;
    }

    /** Apunta el consumo si cabe en la ventana. @return false si no cabe (y no apunta nada). */
    public boolean consumir(Long usuario, long cantidad) {
        Instant ahora = reloj.instant();
        Instant desde = ahora.minus(ventana);
        Deque<Consumo> cola = consumos.computeIfAbsent(usuario, u -> new ArrayDeque<>());
        synchronized (cola) {
            while (!cola.isEmpty() && !cola.peekFirst().cuando().isAfter(desde)) cola.pollFirst();
            long usado = cola.stream().mapToLong(Consumo::cantidad).sum();
            if (usado + cantidad > capacidad) return false;
            cola.addLast(new Consumo(ahora, cantidad));
            return true;
        }
    }
}
