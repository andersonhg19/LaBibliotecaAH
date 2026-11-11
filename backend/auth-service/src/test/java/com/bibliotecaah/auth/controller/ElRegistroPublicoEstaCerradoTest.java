package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.security.JWTAuthorizationFilter;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** QA SE-03 (registro cerrado por defecto), SE-08 (origen del login) y SE-02 (renovar). */
@WebMvcTest(AuthenticationController.class)
@AutoConfigureMockMvc(addFilters = false)
@org.springframework.context.annotation.Import(com.bibliotecaah.auth.util.Mensajes.class)
@TestPropertySource(properties = {"biblioteca.registro-publico=false", "biblioteca.login.proxies-confiables=2"})
@DisplayName("Alta publica cerrada, origen del login y renovacion")
class ElRegistroPublicoEstaCerradoTest {

    @Autowired private MockMvc mvc;
    @MockBean private AuthenticationService autenticacion;
    @MockBean private UserService usuarios;
    @MockBean private JWTAuthorizationFilter filtro;
    @MockBean private SecParams secParams;

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("con REGISTRO_PUBLICO=false el alta responde 403 con mensaje claro y no crea nada")
    void registroCerrado() throws Exception {
        mvc.perform(post("/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"x@x.co\",\"alias\":\"xxx\",\"password\":\"ClaveSegura2026\"}"))
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(403))
                .andExpect(jsonPath("$.message")
                        .value("El registro está cerrado: pide a un administrador que te cree la cuenta."));
        verify(usuarios, never()).register(any());
    }

    @Test
    @DisplayName("el login pasa al servicio el origen que anadio el proxy de confianza")
    void origenDelLogin() throws Exception {
        when(autenticacion.authenticate(any(), eq("100.64.0.7"))).thenReturn(new AuthenticationResponse());
        mvc.perform(post("/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Forwarded-For", "6.6.6.6, 100.64.0.7, 172.20.0.1")
                        .content("{\"usuario\":\"ana\",\"password\":\"x\"}"))
                .andExpect(jsonPath("$.correct").value(true));
        verify(autenticacion).authenticate(any(), eq("100.64.0.7"));
    }

    @Nested
    @DisplayName("Renovar")
    class Renovar {

        private void comoUsuario(long id) {
            var auth = new UsernamePasswordAuthenticationToken("ana@biblioteca.ah", null, List.of());
            auth.setDetails(id);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        @Test
        @DisplayName("con la cuenta activa devuelve el token nuevo")
        void activa() throws Exception {
            comoUsuario(5L);
            AuthenticationResponse r = new AuthenticationResponse();
            r.setToken("nuevo");
            when(autenticacion.renovar(5L)).thenReturn(Optional.of(r));
            mvc.perform(post("/v1/auth/renovar"))
                    .andExpect(jsonPath("$.correct").value(true))
                    .andExpect(jsonPath("$.object.token").value("nuevo"));
        }

        @Test
        @DisplayName("si la cuenta ya no esta activa responde 401")
        void inactiva() throws Exception {
            comoUsuario(5L);
            when(autenticacion.renovar(5L)).thenReturn(Optional.empty());
            mvc.perform(post("/v1/auth/renovar"))
                    .andExpect(jsonPath("$.errorCode").value(401))
                    .andExpect(jsonPath("$.message").value("Tu sesión ya no es válida. Vuelve a iniciar sesión."));
        }

        @Test
        @DisplayName("/sesion confirma que el token sigue vigente")
        void sesion() throws Exception {
            mvc.perform(post("/v1/auth/sesion")).andExpect(jsonPath("$.object").value(true));
        }
    }
}
