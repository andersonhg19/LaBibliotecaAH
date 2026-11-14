package com.bibliotecaah.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.RouteMetadataUtils;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Tiempo de respuesta por ruta (auditoria BK-05). El tope general del gateway
 * (spring.cloud.gateway.server.webflux.httpclient.response-timeout) es corto; solo las rutas
 * que de verdad lo necesitan (subidas de hasta 1 GB, cuya respuesta llega
 * cuando el servicio termina de leer el cuerpo) esperan mas.
 *
 * El tope cuenta hasta que llegan las CABECERAS de la respuesta: un audio o un
 * original que se descargan durante media hora no se cortan, porque el
 * servicio responde enseguida y el cuerpo va en streaming.
 *
 * Las rutas salen del discovery, asi que no tienen metadatos propios: este
 * filtro le pone el metadato "response-timeout" a la ruta de ESTA peticion,
 * que es lo que NettyRoutingFilter consulta.
 */
@Component
public class TiempoDeRespuestaPorRutaFilter implements GlobalFilter, Ordered {

    private final List<String> rutasLentas;
    private final Duration tiempoLento;

    public TiempoDeRespuestaPorRutaFilter(
            @Value("${biblioteca.gateway.rutas-lentas:/v1/libros/subir}") List<String> rutasLentas,
            @Value("${biblioteca.gateway.tiempo-rutas-lentas:30m}") Duration tiempoLento) {
        this.rutasLentas = rutasLentas.stream().map(r -> r.trim().toLowerCase(Locale.ROOT)).toList();
        this.tiempoLento = tiempoLento;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        Route ruta = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        if (ruta != null && esLenta(exchange.getRequest().getURI().getPath())) {
            Map<String, Object> metadatos = new HashMap<>(ruta.getMetadata());
            metadatos.put(RouteMetadataUtils.RESPONSE_TIMEOUT_ATTR, tiempoLento.toMillis());
            exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR,
                    Route.async().id(ruta.getId()).uri(ruta.getUri()).order(ruta.getOrder())
                            .asyncPredicate(ruta.getPredicate()).filters(ruta.getFilters())
                            .metadata(metadatos).build());
        }
        return chain.filter(exchange);
    }

    boolean esLenta(String ruta) {
        if (ruta == null) return false;
        String limpia = ruta.toLowerCase(Locale.ROOT).replaceAll("/{2,}", "/");
        while (limpia.endsWith("/") && limpia.length() > 1) limpia = limpia.substring(0, limpia.length() - 1);
        for (String lenta : rutasLentas) {
            if (limpia.endsWith(lenta)) return true;
        }
        return false;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 3;
    }
}
