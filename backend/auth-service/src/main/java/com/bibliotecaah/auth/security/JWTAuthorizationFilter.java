package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
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

@Component
public class JWTAuthorizationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";
    private static final String CLAIM_USER_ID = "userId";
    private static final String CLAIM_ROLES = "roles";

    private final SecParams secParams;

    public JWTAuthorizationFilter(SecParams secParams) {
        this.secParams = secParams;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader(AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith(BEARER)) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            String token = authHeader.substring(BEARER.length());
            JWTVerifier verifier = JWT.require(Algorithm.HMAC256(secParams.getSecret())).build();
            DecodedJWT decodedJWT = verifier.verify(token);

            String email = decodedJWT.getSubject();

            /* Las autoridades salen del claim "roles", que firma auth-service al
               dar el token. Un token viejo de antes de la ola 4 no trae el
               claim: en ese caso la lista queda vacia y el usuario entra como
               autenticado pero sin permisos de administracion. Es lo correcto
               —no se le niega la aplicacion a quien tenia sesion abierta, pero
               tampoco se le regala un rol que su token no dice que tenga. */
            Collection<GrantedAuthority> autoridades = new ArrayList<>();
            List<String> roles = decodedJWT.getClaim(CLAIM_ROLES).asList(String.class);
            if (roles != null) {
                roles.forEach(rol -> autoridades.add(new SimpleGrantedAuthority(rol)));
            }

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(email, null, autoridades);

            /* El token SIEMPRE trajo el id del usuario (AuthenticationServiceImpl
               lo firma como claim "userId"), pero nadie lo leia: la identidad
               llegaba en el cuerpo de cada peticion, o sea que la ponia el
               cliente. De ahi salia que un usuario pudiera pedir los datos de
               otro simplemente cambiando un numero. Aqui se recoge una sola vez
               y SecurityUtils lo reparte al resto del servicio. */
            Long userId = decodedJWT.getClaim(CLAIM_USER_ID).asLong();
            authentication.setDetails(userId);

            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (JWTVerificationException e) {
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"correct\":false,\"message\":\"Invalid or expired token\",\"errorCode\":401}");
            return;
        }

        filterChain.doFilter(request, response);
    }
}
