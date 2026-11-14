package com.bibliotecaah.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.firewall.RequestRejectedHandler;

import java.io.IOException;

@Slf4j
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
                        /* Validacion web 0.4.0 (V-NUEVO-2): /error abierto, como en biblioteca. Si una
                           excepcion salia de un filtro (p. ej. la consulta de la sesion con la base
                           tropezando), el despacho a /error llegaba sin autenticacion y respondia 401
                           «Necesitas iniciar sesión» a un token valido; biblioteca lo tomaba por una
                           revocacion. Ahora sale el error de verdad (5xx). */
                        .requestMatchers("/error").permitAll()
                        /* La especificacion OpenAPI y Swagger UI van sin token a
                           proposito: son la documentacion de como pedir el token.
                           Detras hay un boton "Authorize" que si lo exige para
                           llamar a nada. Estos tres servicios ademas solo se
                           publican en 127.0.0.1; la unica puerta desde la red es
                           el gateway. */
                        /* QA SE-15: el gateway ya no las deja pasar; aqui siguen abiertas para
                           quien llegue al puerto local (127.0.0.1). */
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
                /* QA SE-11: sin token, 401; sin rol, 403; los dos con el ResultDTO del
                   contrato (antes: 403 con el cuerpo vacio en ambos casos y la web no
                   distinguia "inicia sesion" de "no puedes"). */
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> sinSesion(req, res))
                        .accessDeniedHandler((req, res, ex) -> escribir(res, 403, SIN_PERMISO)))
                .addFilterBefore(authorizationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Validacion 0.4.0 (V-NUEVO-3): una ruta que el cortafuegos de Spring Security rechaza
     * ({@code ./}, {@code ..}, {@code %2e}, {@code ;}) salia con el JSON por defecto de Spring
     * ({timestamp, status, error, path}). Ahora: 400 con el ResultDTO del contrato, igual que lo que
     * rechaza Tomcat (TomcatConfig). Spring Security toma este bean solo.
     */
    @Bean
    RequestRejectedHandler rutaRechazada() {
        return (req, res, ex) -> {
            log.info("Ruta rechazada por el cortafuegos: {} ({})", req.getMethod(), ex.getMessage());
            escribir(res, 400, RUTA_INVALIDA);
        };
    }

    /** 401 del contrato y, desde la validacion web 0.4.0 (V-NUEVO-2), WARN con la ruta (nunca el token). */
    static void sinSesion(HttpServletRequest req, HttpServletResponse res) throws IOException {
        String cabecera = req.getHeader("Authorization");
        log.warn("Peticion sin sesion en {} {} (dispatch {}): {}", req.getMethod(), req.getRequestURI(),
                req.getDispatcherType(), cabecera == null ? "sin cabecera Authorization"
                        : cabecera.startsWith("Bearer ") ? "con Bearer (el token no llego al filtro)"
                        : "cabecera Authorization sin Bearer");
        escribir(res, 401, SIN_SESION);
    }

    static final String RUTA_INVALIDA = "{\"correct\":false,\"message\":\"La dirección pedida no es válida.\",\"errorCode\":400}";
    static final String SIN_SESION = "{\"correct\":false,\"message\":\"Necesitas iniciar sesión.\",\"errorCode\":401}";
    static final String SIN_PERMISO = "{\"correct\":false,\"message\":\"No tienes permiso para hacer esto.\",\"errorCode\":403}";

    static void escribir(HttpServletResponse res, int estado, String cuerpo) throws IOException {
        res.setStatus(estado);
        res.setContentType("application/json;charset=UTF-8");
        res.setCharacterEncoding("UTF-8");
        res.getWriter().write(cuerpo);
    }
}
