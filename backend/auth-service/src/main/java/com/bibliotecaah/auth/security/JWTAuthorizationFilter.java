package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.bibliotecaah.auth.repository.UserRepository;
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

@Slf4j
@Component
public class JWTAuthorizationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";
    private static final String CLAIM_USER_ID = "userId";
    private static final String CLAIM_ROLES = "roles";

    static final String TOKEN_INVALIDO =
            "{\"correct\":false,\"message\":\"Sesión inválida o vencida. Vuelve a iniciar sesión.\",\"errorCode\":401}";
    static final String SESION_REVOCADA =
            "{\"correct\":false,\"message\":\"Tu sesión ya no es válida (la cuenta cambió o se desactivó). "
                    + "Vuelve a iniciar sesión.\",\"errorCode\":401}";

    private final SecParams secParams;
    private final UserRepository usuarios;

    public JWTAuthorizationFilter(SecParams secParams, UserRepository usuarios) {
        this.secParams = secParams;
        this.usuarios = usuarios;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader(AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith(BEARER)) {
            filterChain.doFilter(request, response);
            return;
        }

        DecodedJWT decodedJWT;
        try {
            String token = authHeader.substring(BEARER.length());
            /* exp y userId obligatorios (QA SE-18): un token sin caducidad o sin
               dueno no lo emite nunca este servicio. */
            JWTVerifier verifier = JWT.require(Algorithm.HMAC256(secParams.getSecret()))
                    .withClaimPresence("exp")
                    .withClaimPresence(CLAIM_USER_ID)
                    .build();
            decodedJWT = verifier.verify(token);
        } catch (JWTVerificationException e) {
            rechazar(response, TOKEN_INVALIDO);
            return;
        }

        Long userId = decodedJWT.getClaim(CLAIM_USER_ID).asLong();
        Integer version = decodedJWT.getClaim(EmisorDeTokens.CLAIM_VERSION).asInt();

        /* QA SE-02: una firma valida no basta. Si la cuenta se desactivo o su
           version de sesion subio (roles o clave cambiados), el token muere ya,
           no a los 10 dias. Es una consulta por clave primaria: auth-service
           recibe pocas peticiones y aqui no hace falta cache. */
        boolean vigente = userId != null && usuarios.estadoDeSesion(userId)
                .map(estado -> estado.admite(version))
                .orElse(false);
        if (!vigente) {
            log.info("Token rechazado: sesion revocada o cuenta inactiva (usuario {})", userId);
            rechazar(response, SESION_REVOCADA);
            return;
        }

        /* Las autoridades salen del claim "roles", que firma auth-service al
           dar el token. Un token sin el claim entra sin permisos de
           administracion. */
        Collection<GrantedAuthority> autoridades = new ArrayList<>();
        List<String> roles = decodedJWT.getClaim(CLAIM_ROLES).asList(String.class);
        if (roles != null) {
            roles.forEach(rol -> autoridades.add(new SimpleGrantedAuthority(rol)));
        }

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(decodedJWT.getSubject(), null, autoridades);
        /* La identidad sale del token (claim userId) y de ningun otro sitio;
           SecurityUtils la reparte al resto del servicio. */
        authentication.setDetails(userId);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }

    private static void rechazar(HttpServletResponse response, String cuerpo) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(cuerpo);
    }
}
