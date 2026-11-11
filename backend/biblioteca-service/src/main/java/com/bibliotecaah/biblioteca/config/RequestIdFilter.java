package com.bibliotecaah.biblioteca.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * ID de correlacion (estandares §23): toma X-Request-Id del gateway (o genera
 * uno si se llama directo), lo pone en el MDC para los logs y lo devuelve en la
 * respuesta.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String CABECERA = "X-Request-Id";
    public static final String CLAVE_MDC = "requestId";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String id = request.getHeader(CABECERA);
        if (id == null || id.isBlank() || id.length() > 100) {
            id = UUID.randomUUID().toString();
        }
        MDC.put(CLAVE_MDC, id);
        response.setHeader(CABECERA, id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(CLAVE_MDC);
        }
    }
}
