package com.bibliotecaah.biblioteca.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;
import java.util.Map;

/** Llamadas al taller (Python). Propaga el JWT y el X-Request-Id de la peticion en curso. */
@Slf4j
@Component
public class TallerClient {

    private final RestClient cliente;

    public TallerClient(@Qualifier("clienteDelTaller") RestClient cliente) {
        this.cliente = cliente;
    }

    /** GET /voces. Lanza si el taller no responde: quien llama decide el respaldo. */
    public List<Map<String, Object>> voces() {
        return cliente.get().uri("/voces")
                .headers(this::propagar)
                .retrieve()
                .body(new ParameterizedTypeReference<List<Map<String, Object>>>() { });
    }

    private void propagar(HttpHeaders cabeceras) {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes atributos) {
            String jwt = atributos.getRequest().getHeader(HttpHeaders.AUTHORIZATION);
            if (jwt != null) cabeceras.set(HttpHeaders.AUTHORIZATION, jwt);
            String id = atributos.getRequest().getHeader("X-Request-Id");
            if (id != null) cabeceras.set("X-Request-Id", id);
        }
    }
}
