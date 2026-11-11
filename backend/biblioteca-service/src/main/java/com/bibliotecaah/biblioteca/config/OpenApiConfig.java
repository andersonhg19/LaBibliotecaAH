package com.bibliotecaah.biblioteca.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String ESQUEMA_JWT = "bearerAuth";

    @Bean
    public OpenAPI openApiDeBiblioteca() {
        return new OpenAPI()
                .info(new Info()
                        .title("La Biblioteca AH — biblioteca-service")
                        .version("1.0.0")
                        .description("Libros, estantes, progreso, notas, voces y archivos. "
                                + "Todo POST con ResultDTO salvo los binarios (GET con Range y ?t=)."))
                .components(new Components().addSecuritySchemes(ESQUEMA_JWT,
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(ESQUEMA_JWT));
    }
}
