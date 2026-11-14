package com.bibliotecaah.biblioteca.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTDecodeException;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.regex.Pattern;

/**
 * El mismo filtro JWT de Oh Churus (HMAC256, claims userId y roles), con UNA
 * ampliacion: en las rutas de binarios el token tambien puede llegar como
 * {@code ?t=<jwt>}, porque ni {@code <audio>} ni el lector pueden mandar
 * cabeceras. Solo ahi: en el resto de la API un token en la URL no vale (las
 * URLs acaban en logs e historiales).
 */
@Slf4j
@Component
public class JWTAuthorizationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";
    private static final String PARAM_TOKEN = "t";

    /** Rutas (sin context-path) que aceptan el token por la URL. */
    static final Pattern RUTAS_CON_TOKEN_EN_URL =
            Pattern.compile("^/v1/(archivos/.+|voces/[^/]+/muestra\\.mp3)$");

    static final String TOKEN_INVALIDO =
            "{\"correct\":false,\"message\":\"Sesion invalida o vencida\",\"errorCode\":401}";
    static final String SESION_REVOCADA = "{\"correct\":false,\"message\":\"Tu sesión ya no es válida "
            + "(la cuenta cambió o se desactivó). Vuelve a iniciar sesión.\",\"errorCode\":401}";

    private final SecParams secParams;
    private final VigenciaDeSesiones vigencia;

    public JWTAuthorizationFilter(SecParams secParams, VigenciaDeSesiones vigencia) {
        this.secParams = secParams;
        this.vigencia = vigencia;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = tokenDe(request);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }

        DecodedJWT jwt;
        try {
            /* exp y userId obligatorios (QA SE-18). */
            /* iat no se exige "en el pasado" (V-NUEVO-2): el token lo firma auth-service con SU reloj y
               un reloj que se corrige hacia atras (VM de Docker, NTP) dejaba fuera, sin log, los tokens
               recien emitidos. iat es informativo (BK-08); la caducidad (exp) si se comprueba. */
            jwt = JWT.require(Algorithm.HMAC256(secParams.getSecret()))
                    .withClaimPresence("exp").withClaimPresence("userId").ignoreIssuedAt().build().verify(token);
        } catch (JWTVerificationException e) {
            log.warn("Token rechazado en {} {}: {}", request.getMethod(), request.getRequestURI(), motivo(e));
            rechazar(response, TOKEN_INVALIDO);
            return;
        }
        /* QA SE-02: cuenta desactivada o version de sesion vieja = fuera. */
        if (!vigencia.vigente(jwt.getClaim("userId").asLong(), jwt.getClaim("ver").asInt(), token)) {
            log.warn("Token rechazado en {} {}: sesion revocada en auth-service (usuario {}, token {})",
                    request.getMethod(), request.getRequestURI(), jwt.getClaim("userId").asLong(),
                    VigenciaDeSesiones.huella(token));
            rechazar(response, SESION_REVOCADA);
            return;
        }
        Collection<GrantedAuthority> autoridades = new ArrayList<>();
        List<String> roles = jwt.getClaim("roles").asList(String.class);
        if (roles != null) {
            roles.forEach(rol -> autoridades.add(new SimpleGrantedAuthority(rol)));
        }
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(jwt.getSubject(), null, autoridades);
        auth.setDetails(jwt.getClaim("userId").asLong());
        SecurityContextHolder.getContext().setAuthentication(auth);

        filterChain.doFilter(request, response);
    }

    /**
     * El tipo de rechazo, sin el token: la clase de la excepcion y, salvo en las de formato (cuyo mensaje
     * puede copiar trozos del token decodificado), su mensaje (firma, caducidad, claim que falta...).
     */
    static String motivo(JWTVerificationException e) {
        String tipo = e.getClass().getSimpleName();
        if (e instanceof JWTDecodeException || e.getMessage() == null) return tipo;
        return tipo + " (" + e.getMessage() + ")";
    }

    private static void rechazar(HttpServletResponse response, String cuerpo) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(cuerpo);
    }

    private String tokenDe(HttpServletRequest request) {
        String cabecera = request.getHeader(AUTHORIZATION);
        if (cabecera != null && cabecera.startsWith(BEARER)) {
            return cabecera.substring(BEARER.length());
        }
        if (aceptaTokenEnUrl(request)) {
            String t = request.getParameter(PARAM_TOKEN);
            if (t != null && !t.isBlank()) return t;
        }
        return null;
    }

    static boolean aceptaTokenEnUrl(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contexto = request.getContextPath();
        String ruta = (contexto != null && !contexto.isEmpty() && uri.startsWith(contexto))
                ? uri.substring(contexto.length()) : uri;
        return "GET".equalsIgnoreCase(request.getMethod()) || "HEAD".equalsIgnoreCase(request.getMethod())
                ? RUTAS_CON_TOKEN_EN_URL.matcher(ruta).matches()
                : false;
    }
}
