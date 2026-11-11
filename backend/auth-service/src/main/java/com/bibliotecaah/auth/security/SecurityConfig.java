package com.bibliotecaah.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /* La constante, y no la cadena suelta en cada requestMatchers. Un "ADMN"
       mal tecleado en una regla de autorizacion no falla al arrancar ni al
       compilar: simplemente deja de coincidir con el rol de nadie y la regla
       se vuelve inalcanzable. Con la constante, el error de dedo es un error
       de compilacion. */
    private static final String ADMIN = "ADMIN";

    private final JWTAuthorizationFilter authorizationFilter;

    public SecurityConfig(JWTAuthorizationFilter authorizationFilter) {
        this.authorizationFilter = authorizationFilter;
    }

    @Bean
    SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/**").permitAll()
                        /* La especificacion OpenAPI y Swagger UI van sin token a
                           proposito: son la documentacion de como pedir el token.
                           Detras hay un boton "Authorize" que si lo exige para
                           llamar a nada. Estos tres servicios ademas solo se
                           publican en 127.0.0.1; la unica puerta desde la red es
                           el gateway. */
                        .requestMatchers("/v3/api-docs", "/v3/api-docs/**",
                                "/swagger-ui.html", "/swagger-ui/**").permitAll()
                        .requestMatchers("/v1/auth/login").permitAll()
                        .requestMatchers("/v1/auth/register").permitAll()
                        /* Administracion: usuarios de otros, roles, modulos y
                           permisos. Todo lo que hay debajo de /v1/admin exige
                           el rol, y la regla vive aqui —en el propio servicio—
                           y no solo en el gateway: si alguien alcanza el
                           puerto del microservicio, esto sigue puesto. */
                        .requestMatchers("/v1/admin/**").hasAuthority(ADMIN)
                        .anyRequest().authenticated())
                .addFilterBefore(authorizationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
