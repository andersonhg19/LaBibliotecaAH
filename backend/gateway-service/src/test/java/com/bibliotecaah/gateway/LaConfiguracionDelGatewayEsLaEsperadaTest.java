package com.bibliotecaah.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.config.GlobalCorsProperties;
import org.springframework.cloud.gateway.config.GatewayProperties;
import org.springframework.cloud.gateway.filter.FilterDefinition;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Vigila la forma de application.yml. Regresiones RG-01 y RG-02 (QA de regresion, 2026-11-11):
 * un bloque mal sangrado dejo globalcors fuera de spring.cloud.gateway (la web no podia llamar
 * a la API: preflight 403) y un Retry sobre POST guardaba en memoria cuerpos de subida de 300 MB.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "CORS_ALLOWED_ORIGINS=https://web.ejemplo:7050,http://localhost:4100",
        "eureka.client.enabled=false"
})
@DisplayName("La configuracion del gateway es la esperada")
class LaConfiguracionDelGatewayEsLaEsperadaTest {

    @Autowired
    private GlobalCorsProperties cors;

    @Autowired
    private GatewayProperties gateway;

    @Nested
    @DisplayName("CORS (RG-01)")
    class Cors {

        @Test
        @DisplayName("la lista de origenes viene de CORS_ALLOWED_ORIGINS y nunca es comodin")
        void origenesExplicitos() {
            CorsConfiguration conf = cors.getCorsConfigurations().get("/**");

            assertThat(conf).as("globalcors debe estar bajo spring.cloud.gateway").isNotNull();
            assertThat(conf.getAllowedOrigins())
                    .containsExactly("https://web.ejemplo:7050", "http://localhost:4100");
            assertThat(conf.getAllowCredentials()).isTrue();
            assertThat(conf.getExposedHeaders()).contains("Content-Range", "Accept-Ranges", "X-Request-Id");
        }
    }

    @Nested
    @DisplayName("Reintentos (RG-02)")
    class Reintentos {

        @Test
        @DisplayName("no hay filtro Retry global: guardaria en memoria el cuerpo de cada subida")
        void sinRetryGlobal() {
            List<FilterDefinition> filtros = gateway.getDefaultFilters();

            assertThat(filtros).noneMatch(f -> "Retry".equals(f.getName()));
            assertThat(gateway.getRoutes()).allSatisfy(ruta ->
                    assertThat(ruta.getFilters()).noneMatch(f -> "Retry".equals(f.getName())));
        }
    }
}
