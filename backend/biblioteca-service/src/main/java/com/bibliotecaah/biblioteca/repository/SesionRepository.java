package com.bibliotecaah.biblioteca.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** (0.4.0, contrato C4) Sesiones de lectura y escucha: bah_lib_sesion. */
public interface SesionRepository {

    /** Lo que llega en un latido (ya validado). */
    record Latido(UUID sesionId, Long usuarioId, UUID ejemplarId, String modo, int segundos, Integer capitulo,
                  BigDecimal posicion, String dispositivo, Instant ahora) { }

    /**
     * Crea la sesion o la alarga. Al alargar, los segundos que suma un latido no
     * pasan del tiempo real transcurrido desde el anterior (+ un margen): un
     * cliente que repita latidos no infla las estadisticas. Devuelve los
     * segundos totales, o null si ese sesionId ya es de otro usuario o de otro
     * ejemplar (no se toca).
     */
    Integer latido(Latido latido);

    /** Segundos por dia (en la zona dada), modo y ejemplar entre dos fechas (incluidas). */
    record Fila(LocalDate dia, String modo, UUID ejemplarId, String titulo, long segundos) { }

    List<Fila> porDia(Long usuarioId, LocalDate desde, LocalDate hasta, String zona);

    /** Dias (en la zona dada) con al menos {@code minimoSegundos} de lectura o escucha, en orden. */
    List<LocalDate> diasActivos(Long usuarioId, String zona, int minimoSegundos);
}
