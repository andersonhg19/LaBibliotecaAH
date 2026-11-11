package com.bibliotecaah.auth.security;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Arrays;
import java.util.List;

/**
 * De que dispositivo viene un login (QA SE-08), sin fiarse del cliente.
 *
 * Cada proxy por el que pasa la peticion ANADE al final de X-Forwarded-For la
 * direccion que ve; lo que escriba el cliente queda a la izquierda. Con
 * {@code saltos} proxies de confianza delante de este servicio (en casa:
 * Tailscale serve y el gateway = 2), el origen fiable es la entrada numero
 * {@code saltos} contando desde la derecha: la que anadio el proxy de confianza
 * mas externo. Si hay menos entradas, la de mas a la izquierda (hubo menos
 * proxies); sin la cabecera, la IP de la conexion.
 */
public final class OrigenDeLaPeticion {

    static final String CABECERA = "X-Forwarded-For";

    private OrigenDeLaPeticion() {}

    public static String de(HttpServletRequest request, int saltos) {
        String cabecera = request.getHeader(CABECERA);
        List<String> entradas = cabecera == null ? List.of() : Arrays.stream(cabecera.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        if (entradas.isEmpty()) {
            return request.getRemoteAddr();
        }
        int indice = Math.max(0, entradas.size() - Math.max(1, saltos));
        return entradas.get(indice);
    }
}
