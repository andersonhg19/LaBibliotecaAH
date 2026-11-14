package com.bibliotecaah.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.handler.AsyncPredicate;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.RouteMetadataUtils;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Errores propios del gateway (BK-03) y tiempo de respuesta por ruta (BK-05)")
class ErroresYTiemposDelGatewayTest {

    @Nested
    @DisplayName("BK-03: errores con el ResultDTO del contrato y cabeceras de seguridad")
    class Errores {

        private final ErroresDelGateway manejador = new ErroresDelGateway();

        private MockServerWebExchange manejar(Throwable error) {
            MockServerWebExchange ex = MockServerWebExchange.from(MockServerHttpRequest.get("/NOEXISTE/x").build());
            manejador.handle(ex, error).block();
            return ex;
        }

        @Test
        @DisplayName("404 de enrutado: ResultDTO sin timestamp/path/requestId, con nosniff, DENY, no-referrer y no-store")
        void noEncontrado() {
            MockServerWebExchange ex = manejar(new ResponseStatusException(HttpStatus.NOT_FOUND));

            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(ex.getResponse().getBodyAsString().block())
                    .isEqualTo("{\"correct\":false,\"message\":\"Recurso no encontrado\",\"errorCode\":404}");
            var h = ex.getResponse().getHeaders();
            assertThat(h.getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
            assertThat(h.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
            assertThat(h.getFirst("X-Frame-Options")).isEqualTo("DENY");
            assertThat(h.getFirst("Referrer-Policy")).isEqualTo("no-referrer");
            assertThat(h.getCacheControl()).isEqualTo("no-store");
        }

        @Test
        @DisplayName("503 sin instancias, 504 por tiempo, 405, 400 y un error cualquiera = 500")
        void otrosCodigos() {
            assertThat(manejar(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)).getResponse()
                    .getBodyAsString().block()).contains("\"errorCode\":503").contains("no esta disponible");
            MockServerWebExchange tiempo = manejar(new TimeoutException("lento"));
            assertThat(tiempo.getResponse().getStatusCode()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
            assertThat(tiempo.getResponse().getBodyAsString().block()).contains("\"errorCode\":504");
            assertThat(ErroresDelGateway.estado(new IllegalStateException("x", new TimeoutException())))
                    .isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
            assertThat(ErroresDelGateway.cuerpo(HttpStatus.METHOD_NOT_ALLOWED)).contains("Metodo no permitido");
            assertThat(ErroresDelGateway.cuerpo(HttpStatus.BAD_REQUEST)).contains("Peticion no valida");
            MockServerWebExchange raro = manejar(new IllegalStateException("boom"));
            assertThat(raro.getResponse().getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(raro.getResponse().getBodyAsString().block())
                    .isEqualTo("{\"correct\":false,\"message\":\"Error inesperado\",\"errorCode\":500}");
        }

        @Test
        @DisplayName("con la respuesta ya enviada no se reescribe: se propaga el error")
        void yaEnviada() {
            MockServerWebExchange ex = MockServerWebExchange.from(MockServerHttpRequest.get("/x").build());
            ex.getResponse().setComplete().block();
            IllegalStateException error = new IllegalStateException("tarde");
            AtomicReference<Throwable> visto = new AtomicReference<>();
            manejador.handle(ex, error).onErrorResume(e -> {
                visto.set(e);
                return Mono.empty();
            }).block();
            assertThat(visto.get()).isSameAs(error);
        }
    }

    @Nested
    @DisplayName("BK-05: solo las subidas esperan 30 minutos")
    class Tiempos {

        private final TiempoDeRespuestaPorRutaFilter filtro =
                new TiempoDeRespuestaPorRutaFilter(List.of("/v1/libros/subir"), Duration.ofMinutes(30));

        private Route ruta() {
            return Route.async().id("BIBLIOTECA-SERVICE").uri(URI.create("lb://BIBLIOTECA-SERVICE"))
                    .asyncPredicate(AsyncPredicate.from(e -> true)).metadata(Map.of("otro", 1)).build();
        }

        private Route pasar(String camino) {
            MockServerWebExchange ex = MockServerWebExchange.from(MockServerHttpRequest.post(camino).build());
            ex.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR, ruta());
            filtro.filter(ex, e -> Mono.empty()).block();
            return ex.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        }

        @Test
        @DisplayName("la subida lleva response-timeout de 30 min y conserva el resto de la ruta")
        void subida() {
            Route r = pasar("/BIBLIOTECA-SERVICE/biblioteca/v1/libros/subir/");
            assertThat(r.getMetadata()).containsEntry(RouteMetadataUtils.RESPONSE_TIMEOUT_ATTR, 1_800_000L)
                    .containsEntry("otro", 1);
            assertThat(r.getId()).isEqualTo("BIBLIOTECA-SERVICE");
            assertThat(r.getUri()).isEqualTo(URI.create("lb://BIBLIOTECA-SERVICE"));
        }

        @Test
        @DisplayName("el resto usa el tope general (sin metadato); sin ruta no hace nada")
        void resto() {
            assertThat(pasar("/BIBLIOTECA-SERVICE/biblioteca/v1/libros/all").getMetadata())
                    .doesNotContainKey(RouteMetadataUtils.RESPONSE_TIMEOUT_ATTR);
            assertThat(filtro.esLenta(null)).isFalse();
            assertThat(filtro.esLenta("/BIBLIOTECA-SERVICE//biblioteca//V1/LIBROS/SUBIR")).isTrue();
            MockServerWebExchange sinRuta = MockServerWebExchange.from(MockServerHttpRequest.post("/a/b/v1/libros/subir").build());
            filtro.filter(sinRuta, e -> Mono.empty()).block();
            assertThat((Object) sinRuta.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR)).isNull();
            assertThat(filtro.getOrder()).isEqualTo(Integer.MIN_VALUE + 3);
        }
    }
}
