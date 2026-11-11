package com.bibliotecaah.gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Cabeceras de seguridad en TODA respuesta del gateway (QA SE-05), puestas
 * justo antes de enviar para que ganen a las que traiga el servicio (sin
 * duplicarlas):
 *  · X-Content-Type-Options: nosniff (un JSON no se interpreta como HTML);
 *  · X-Frame-Options: DENY (la API no se enmarca);
 *  · Referrer-Policy: no-referrer (las URLs con ?t= no se filtran a terceros);
 *  · Cache-Control: no-store en las respuestas JSON (datos personales), si el
 *    servicio no dijo otra cosa; los binarios conservan su "private".
 *
 * La CSP de la web va en el servidor del frontend, no aqui: esta API no sirve
 * HTML.
 */
@Component
public class CabecerasDeSeguridadFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpResponse respuesta = exchange.getResponse();
        respuesta.beforeCommit(() -> {
            poner(respuesta.getHeaders());
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    static void poner(HttpHeaders h) {
        h.set("X-Content-Type-Options", "nosniff");
        h.set("X-Frame-Options", "DENY");
        h.set("Referrer-Policy", "no-referrer");
        MediaType tipo = h.getContentType();
        if (tipo != null && MediaType.APPLICATION_JSON.isCompatibleWith(tipo) && !h.containsKey(HttpHeaders.CACHE_CONTROL)) {
            h.setCacheControl("no-store");
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 2;
    }
}
