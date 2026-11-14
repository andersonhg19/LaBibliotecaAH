package com.bibliotecaah.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("El gateway no ensena lo interno (SE-15) y pone cabeceras de seguridad (SE-05, SE-19)")
class ElGatewayNoEnsenaLoInternoTest {

    @Nested
    @DisplayName("Rutas internas")
    class RutasInternas {

        private final RutasInternasFilter filtro = new RutasInternasFilter();

        @Test
        @DisplayName("swagger, api-docs, el indice de actuator y /error responden 404 sin llegar al servicio")
        void bloquea() {
            for (String ruta : List.of(
                    "/AUTH-SERVICE/biblioteca/v3/api-docs",
                    "/BIBLIOTECA-SERVICE/biblioteca/v3/api-docs/swagger-config",
                    "/AUTH-SERVICE/biblioteca/swagger-ui/index.html",
                    "/auth-service/biblioteca/swagger-ui.html",
                    "/AUTH-SERVICE/biblioteca/actuator",
                    "/AUTH-SERVICE/biblioteca/actuator/env",
                    "/AUTH-SERVICE/biblioteca/actuator/healthx",
                    "/BIBLIOTECA-SERVICE/biblioteca/error",
                    "/BIBLIOTECA-SERVICE//biblioteca//V3/API-DOCS/",
                    "/BIBLIOTECA-SERVICE/biblioteca/webjars/swagger-ui/x.js")) {
                MockServerWebExchange ex = MockServerWebExchange.from(MockServerHttpRequest.get(ruta).build());
                AtomicBoolean siguio = new AtomicBoolean(false);
                filtro.filter(ex, e -> {
                    siguio.set(true);
                    return Mono.empty();
                }).block();

                assertThat(siguio.get()).as(ruta).isFalse();
                assertThat(ex.getResponse().getStatusCode()).as(ruta).isEqualTo(HttpStatus.NOT_FOUND);
                assertThat(ex.getResponse().getBodyAsString().block()).isEqualTo(RutasInternasFilter.CUERPO);
                /* V-NUEVO-2 (validacion 0.4.0): esta 404 corta la cadena antes del filtro de cabeceras. */
                var h = ex.getResponse().getHeaders();
                assertThat(h.getContentType()).as(ruta).isEqualTo(MediaType.APPLICATION_JSON);
                assertThat(h.getFirst("X-Content-Type-Options")).as(ruta).isEqualTo("nosniff");
                assertThat(h.getFirst("X-Frame-Options")).as(ruta).isEqualTo("DENY");
                assertThat(h.getFirst("Referrer-Policy")).as(ruta).isEqualTo("no-referrer");
                assertThat(h.getCacheControl()).as(ruta).isEqualTo("no-store");
            }
        }

        @Test
        @DisplayName("la API, los binarios y /actuator/health pasan")
        void dejaPasar() {
            for (String ruta : List.of(
                    "/AUTH-SERVICE/biblioteca/actuator/health",
                    "/AUTH-SERVICE/biblioteca/actuator/health/liveness",
                    "/BIBLIOTECA-SERVICE/biblioteca/v1/libros/all",
                    "/BIBLIOTECA-SERVICE/biblioteca/v1/archivos/x/libro.epub",
                    "/actuator/health",
                    "/")) {
                assertThat(RutasInternasFilter.esInterna(ruta)).as(ruta).isFalse();
            }
            assertThat(RutasInternasFilter.esInterna(null)).isFalse();
            assertThat(filtro.getOrder()).isEqualTo(Integer.MIN_VALUE + 1);
        }
    }

    @Nested
    @DisplayName("Cabeceras")
    class Cabeceras {

        private MockServerWebExchange pasar(MockServerWebExchange ex, GatewayFilterChain servicio) {
            new IdDeCorrelacionFilter().filter(ex,
                    e -> new CabecerasDeSeguridadFilter().filter(e, servicio)).block();
            return ex;
        }

        @Test
        @DisplayName("una respuesta JSON del servicio sale con nosniff, DENY, no-referrer, no-store y un solo X-Request-Id")
        void json() {
            MockServerWebExchange ex = MockServerWebExchange.from(
                    MockServerHttpRequest.post("/BIBLIOTECA-SERVICE/biblioteca/v1/libros/all").header("X-Request-Id", "abc").build());
            pasar(ex, e -> {
                e.getResponse().getHeaders().add("X-Request-Id", "abc");
                e.getResponse().getHeaders().add("X-Content-Type-Options", "nosniff");
                e.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
                return e.getResponse().setComplete();
            });

            var h = ex.getResponse().getHeaders();
            assertThat(h.get("X-Request-Id")).containsExactly("abc");
            assertThat(h.get("X-Content-Type-Options")).containsExactly("nosniff");
            assertThat(h.getFirst("X-Frame-Options")).isEqualTo("DENY");
            assertThat(h.getFirst("Referrer-Policy")).isEqualTo("no-referrer");
            assertThat(h.getCacheControl()).isEqualTo("no-store");
        }

        @Test
        @DisplayName("un binario conserva el Cache-Control del servicio")
        void binario() {
            MockServerWebExchange ex = MockServerWebExchange.from(MockServerHttpRequest.get("/x/y/v1/archivos/a/original").build());
            pasar(ex, e -> {
                e.getResponse().getHeaders().setContentType(MediaType.APPLICATION_PDF);
                e.getResponse().getHeaders().setCacheControl("no-cache, private");
                return e.getResponse().setComplete();
            });
            assertThat(ex.getResponse().getHeaders().getCacheControl()).isEqualTo("no-cache, private");
            assertThat(ex.getResponse().getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
            assertThat(new CabecerasDeSeguridadFilter().getOrder()).isEqualTo(Integer.MIN_VALUE + 2);
        }
    }
}
