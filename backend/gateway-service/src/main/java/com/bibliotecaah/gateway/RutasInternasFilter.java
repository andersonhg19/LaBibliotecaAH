package com.bibliotecaah.gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Lo interno de cada servicio no sale por el gateway (QA SE-15).
 *
 * Las rutas por discovery publicaban, sin token, Swagger UI y la spec OpenAPI
 * completa de auth y biblioteca, el indice de actuator (con la IP interna del
 * contenedor) y la pagina /error de Spring. Siguen disponibles en el puerto de
 * cada servicio (127.0.0.1) para quien administra la maquina; por el gateway
 * responden 404 con el ResultDTO del contrato. Solo /actuator/health pasa.
 *
 * La ruta se compara decodificada, en minusculas y con las barras repetidas
 * colapsadas: "//v3/api-docs", "/V3/API-DOCS" o "%2f" no la cuelan.
 */
@Component
public class RutasInternasFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RutasInternasFilter.class);

    /** Lo que va despues de /{SERVICIO}/{context-path}/ . */
    static final Pattern INTERNA = Pattern.compile(
            "^(v3/api-docs.*|swagger-ui.*|swagger-resources.*|webjars/.*|error.*|actuator(?!/health(/.*)?$).*)$");

    static final String CUERPO = "{\"correct\":false,\"message\":\"Recurso no encontrado\",\"errorCode\":404}";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String ruta = exchange.getRequest().getURI().getPath();
        if (!esInterna(ruta)) {
            return chain.filter(exchange);
        }
        log.info("Ruta interna bloqueada en el gateway: {}", ruta);
        ServerHttpResponse respuesta = exchange.getResponse();
        respuesta.setStatusCode(HttpStatus.NOT_FOUND);
        respuesta.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        DataBuffer cuerpo = respuesta.bufferFactory().wrap(CUERPO.getBytes(StandardCharsets.UTF_8));
        return respuesta.writeWith(Mono.just(cuerpo));
    }

    static boolean esInterna(String ruta) {
        if (ruta == null) return false;
        String limpia = ruta.toLowerCase(Locale.ROOT).replaceAll("/{2,}", "/");
        if (limpia.startsWith("/")) limpia = limpia.substring(1);
        /* Rutas por discovery: SERVICIO/context-path/resto. Con menos de tres
           tramos no es una ruta hacia un servicio. */
        String[] tramos = limpia.split("/", 3);
        if (tramos.length < 3) return false;
        String resto = tramos[2];
        while (resto.endsWith("/") && resto.length() > 1) resto = resto.substring(0, resto.length() - 1);
        return INTERNA.matcher(resto).matches();
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
