package com.bibliotecaah.gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * ID de correlacion (estandares §23): cada peticion que entra por el gateway
 * lleva un X-Request-Id. Si el cliente no lo manda (o manda algo raro) se genera
 * aqui; se propaga al servicio de destino y vuelve en la respuesta, de modo que
 * una linea de log de biblioteca-service se puede casar con la peticion que la
 * provoco.
 */
@Component
public class IdDeCorrelacionFilter implements GlobalFilter, Ordered {

    public static final String CABECERA = "X-Request-Id";
    private static final Logger log = LoggerFactory.getLogger(IdDeCorrelacionFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String id = valido(exchange.getRequest().getHeaders().getFirst(CABECERA));
        ServerHttpRequest conId = exchange.getRequest().mutate().headers(h -> h.set(CABECERA, id)).build();
        exchange.getResponse().getHeaders().set(CABECERA, id);
        log.debug("{} {} [{}]", conId.getMethod(), conId.getPath(), id);
        return chain.filter(exchange.mutate().request(conId).build());
    }

    static String valido(String recibido) {
        if (recibido == null || recibido.isBlank() || recibido.length() > 100
                || !recibido.matches("[A-Za-z0-9._-]+")) {
            return UUID.randomUUID().toString();
        }
        return recibido;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
