package com.bibliotecaah.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("El gateway pone un X-Request-Id a cada peticion")
class IdDeCorrelacionFilterTest {

    private final IdDeCorrelacionFilter filtro = new IdDeCorrelacionFilter();

    private String pasar(MockServerHttpRequest peticion, MockServerWebExchange[] salida) {
        MockServerWebExchange exchange = MockServerWebExchange.from(peticion);
        AtomicReference<ServerWebExchange> visto = new AtomicReference<>();
        GatewayFilterChain cadena = e -> {
            visto.set(e);
            return Mono.empty();
        };
        filtro.filter(exchange, cadena).block();
        salida[0] = exchange;
        return visto.get().getRequest().getHeaders().getFirst(IdDeCorrelacionFilter.CABECERA);
    }

    @Nested
    @DisplayName("Generacion y propagacion")
    class Generacion {

        @Test
        @DisplayName("sin cabecera genera un UUID, lo propaga y lo devuelve")
        void genera() {
            MockServerWebExchange[] ex = new MockServerWebExchange[1];
            String id = pasar(MockServerHttpRequest.get("/x").build(), ex);

            assertThat(id).hasSize(36);
            assertThat(ex[0].getResponse().getHeaders().getFirst(IdDeCorrelacionFilter.CABECERA)).isEqualTo(id);
        }

        @Test
        @DisplayName("con una cabecera valida la respeta")
        void respeta() {
            MockServerWebExchange[] ex = new MockServerWebExchange[1];
            String id = pasar(MockServerHttpRequest.get("/x").header("X-Request-Id", "abc-123").build(), ex);
            assertThat(id).isEqualTo("abc-123");
        }

        @Test
        @DisplayName("con una cabecera rara (inyeccion en logs) la reemplaza")
        void reemplaza() {
            assertThat(IdDeCorrelacionFilter.valido("a\nb")).isNotEqualTo("a\nb").hasSize(36);
            assertThat(IdDeCorrelacionFilter.valido("x".repeat(101))).hasSize(36);
            assertThat(IdDeCorrelacionFilter.valido(" ")).hasSize(36);
            assertThat(filtro.getOrder()).isEqualTo(Integer.MIN_VALUE);
        }
    }
}
