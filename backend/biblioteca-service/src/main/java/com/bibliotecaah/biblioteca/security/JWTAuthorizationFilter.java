package com.bibliotecaah.biblioteca.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
@Component
public class JWTAuthorizationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";
    private static final String PARAM_TOKEN = "t";

    /** Rutas (sin context-path) que aceptan el token por la URL. */
    static final Pattern RUTAS_CON_TOKEN_EN_URL =
            Pattern.compile("^/v1/(archivos/.+|voces/[^/]+/muestra\\.mp3)$");

    private final SecParams secParams;

    public JWTAuthorizationFilter(SecParams secParams) {
        this.secParams = secParams;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = tokenDe(request);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            DecodedJWT jwt = JWT.require(Algorithm.HMAC256(secParams.getSecret())).build().verify(token);

            Collection<GrantedAuthority> autoridades = new ArrayList<>();
            List<String> roles = jwt.getClaim("roles").asList(String.class);
            if (roles != null) {
                roles.forEach(rol -> autoridades.add(new SimpleGrantedAuthority(rol)));
            }
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(jwt.getSubject(), null, autoridades);
            auth.setDetails(jwt.getClaim("userId").asLong());
            SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (JWTVerificationException e) {
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"correct\":false,\"message\":\"Sesion invalida o vencida\",\"errorCode\":401}");
            return;
        }

        filterChain.doFilter(request, response);
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
