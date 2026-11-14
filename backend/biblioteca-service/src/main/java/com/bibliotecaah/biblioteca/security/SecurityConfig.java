package com.bibliotecaah.biblioteca.security;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.firewall.RequestRejectedHandler;

import java.io.IOException;

@Slf4j
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /** Rol de administracion (el claim "roles" del token que firma auth-service). */
    static final String ADMIN = "ADMIN";

    private final JWTAuthorizationFilter authorizationFilter;
    private final Mensajes mensajes;
    private final ObjectMapper json;

    public SecurityConfig(JWTAuthorizationFilter authorizationFilter, Mensajes mensajes, ObjectMapper json) {
        this.authorizationFilter = authorizationFilter;
        this.mensajes = mensajes;
        this.json = json;
    }

    @Bean
    SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(r -> r
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs", "/v3/api-docs/**",
                                "/swagger-ui.html", "/swagger-ui/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        /* v1.4: mantenimiento (relleno de generos). La regla vive en
                           el servicio, no solo en el gateway. */
                        .requestMatchers("/v1/admin/**").hasAuthority(ADMIN)
                        .anyRequest().authenticated())
                /* Sin token: 401 (y no el 403 por defecto), para que la web
                   distinga "inicia sesion" de "no puedes". */
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                        /* Con sesion pero sin el rol: 403 con el ResultDTO del contrato. */
                        .accessDeniedHandler((req, res, ex) -> sinPermiso(res)))
                .addFilterBefore(authorizationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /**
     * Validacion 0.4.0 (V-NUEVO-3): una ruta que el cortafuegos de Spring Security rechaza
     * ({@code ./}, {@code ..}, {@code %2e}, {@code ;}) salia con el JSON por defecto de Spring
     * ({timestamp, status, error, path}). Ahora: 400 con el ResultDTO del contrato (120 rutaInvalida),
     * igual que lo que rechaza Tomcat (TomcatConfig). Spring Security toma este bean solo.
     */
    @Bean
    RequestRejectedHandler rutaRechazada() {
        return (req, res, ex) -> {
            log.info("Ruta rechazada por el cortafuegos: {} ({})", req.getMethod(), ex.getMessage());
            res.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            res.setContentType("application/json;charset=UTF-8");
            res.setCharacterEncoding("UTF-8");
            res.getWriter().write(json.writeValueAsString(
                    new ResultDTO(false, mensajes.texto(Message.Msj.rutaInvalida), CodigoError.DATO_INVALIDO)));
        };
    }

    void sinPermiso(HttpServletResponse res) throws IOException {
        res.setStatus(HttpServletResponse.SC_FORBIDDEN);
        res.setContentType("application/json;charset=UTF-8");
        res.setCharacterEncoding("UTF-8");
        res.getWriter().write(json.writeValueAsString(
                new ResultDTO(false, mensajes.texto(Message.Msj.sinPermiso), CodigoError.SIN_PERMISO)));
    }
}
