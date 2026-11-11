package com.bibliotecaah.auth.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * ============================================================================
 * LA ESPECIFICACION OPENAPI DE auth-service
 * ============================================================================
 *
 * POR QUE SE GENERA Y NO SE ESCRIBE
 * ---------------------------------
 * La lista de endpoints vivia en el README y en una coleccion de Postman, y
 * las dos se quedaron atras: describir la API a mano es firmar que algun dia
 * va a mentir. Aqui la spec sale del codigo, y una prueba
 * (LaSpecPublicadaEstaAlDiaTest) compara lo generado con el JSON commiteado en
 * documentación/api. Cambiar un endpoint sin actualizar la spec rompe la
 * construccion.
 *
 * LA VERSION ES A MANO Y ESO ES LO CORRECTO
 * -----------------------------------------
 * No se coge de la del pom: la version de la API es un contrato con quien la
 * consume y cambia cuando cambia el contrato, no cuando se publica un parche.
 *
 * EL ESQUEMA bearerAuth
 * ---------------------
 * Todo lo de este servicio menos /v1/auth/login y /v1/auth/register va con
 * `Authorization: Bearer <jwt>`. Declararlo aqui es lo que hace que el boton
 * "Authorize" de Swagger UI sirva para algo; sin el, cualquiera que abra la
 * documentacion recibe 401 en todo y concluye que la API esta rota.
 */
@Configuration
public class OpenApiConfig {

    /** El nombre tiene que ser el mismo en el esquema y en el requisito. */
    private static final String ESQUEMA_JWT = "bearerAuth";

    @Bean
    public OpenAPI openApiDeAutenticacion() {
        return new OpenAPI()
                .info(new Info()
                        .title("La Biblioteca AH — auth-service")
                        .version("1.0.0")
                        .description("""
                                Usuarios, registro, login y emision del JWT.

                                Todos los endpoints son POST y devuelven HTTP 200 con un
                                ResultDTO: { correct, message, errorCode, object }. Cuando algo
                                falla, `correct` viene en false y `errorCode` imita al codigo
                                HTTP que no se envia.

                                La identidad sale del claim del JWT, nunca del cuerpo: el userId
                                que se mande al consultar o al modificar se ignora."""))
                .components(new Components().addSecuritySchemes(ESQUEMA_JWT,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("El token que devuelve /v1/auth/login")))
                .addSecurityItem(new SecurityRequirement().addList(ESQUEMA_JWT));
    }
}
