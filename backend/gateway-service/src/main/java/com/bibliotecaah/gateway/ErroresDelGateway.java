package com.bibliotecaah.gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeoutException;

/**
 * Errores que genera el PROPIO gateway (auditoria BK-03): ruta a un servicio que
 * no existe, servicio sin instancias, tiempo agotado... Antes salia el JSON por
 * defecto de Spring ({timestamp, path, status, error, requestId}), fuera del
 * contrato, con la ruta y el id interno, y sin las cabeceras de seguridad (el
 * CabecerasDeSeguridadFilter solo corre cuando hay ruta).
 *
 * Ahora: el ResultDTO del contrato {correct:false, message, errorCode} con el
 * codigo HTTP real como errorCode, y nosniff / DENY / no-referrer / no-store.
 * Se registra antes que el manejador por defecto de Spring Boot (orden -2).
 */
@Component
@Order(-2)
public class ErroresDelGateway implements ErrorWebExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ErroresDelGateway.class);

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable error) {
        ServerHttpResponse respuesta = exchange.getResponse();
        if (respuesta.isCommitted()) {
            return Mono.error(error);
        }
        HttpStatusCode estado = estado(error);
        String ruta = exchange.getRequest().getURI().getPath();
        if (estado.is5xxServerError()) {
            log.warn("Error del gateway en {}: {} ({})", ruta, estado.value(), error.getMessage());
        } else {
            log.debug("{} en el gateway: {}", estado.value(), ruta);
        }
        respuesta.setStatusCode(estado);
        HttpHeaders cabeceras = respuesta.getHeaders();
        cabeceras.setContentType(MediaType.APPLICATION_JSON);
        cabeceras.remove(HttpHeaders.CACHE_CONTROL);
        CabecerasDeSeguridadFilter.poner(cabeceras);
        DataBuffer cuerpo = respuesta.bufferFactory().wrap(cuerpo(estado).getBytes(StandardCharsets.UTF_8));
        return respuesta.writeWith(Mono.just(cuerpo));
    }

    static HttpStatusCode estado(Throwable error) {
        if (error instanceof ResponseStatusException r) return r.getStatusCode();
        if (error instanceof TimeoutException || error.getCause() instanceof TimeoutException) {
            return HttpStatus.GATEWAY_TIMEOUT;
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    static String cuerpo(HttpStatusCode estado) {
        int codigo = estado.value();
        String mensaje = switch (codigo) {
            case 404 -> "Recurso no encontrado";
            case 405 -> "Metodo no permitido";
            case 503 -> "El servicio no esta disponible ahora mismo. Intentalo de nuevo en unos minutos.";
            case 504 -> "El servicio tardo demasiado en responder. Intentalo de nuevo.";
            default -> codigo >= 500 ? "Error inesperado" : "Peticion no valida";
        };
        return "{\"correct\":false,\"message\":\"" + mensaje + "\",\"errorCode\":" + codigo + "}";
    }
}
