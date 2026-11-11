package com.bibliotecaah.auth.exception;

import com.bibliotecaah.auth.controller.AuthenticationController;
import com.bibliotecaah.auth.controller.UserController;
import com.bibliotecaah.auth.security.JWTAuthorizationFilter;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El contrato de errores en auth-service: pase lo que pase, HTTP 200 con un
 * ResultDTO legible.
 *
 * Aqui dolia especialmente: el registro y el inicio de sesion son la primera
 * pantalla que ve una persona. Un correo mal escrito devolvia el 400 de Spring
 * y el movil lo mostraba como "Request failed with status code 400", sin decir
 * jamas que el problema era el correo.
 */
@WebMvcTest({AuthenticationController.class, UserController.class})
@org.springframework.context.annotation.Import(com.bibliotecaah.auth.util.Mensajes.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Contrato de errores: siempre 200 con ResultDTO")
class ContratoDeErroresTest {

    private static final String TEXTO_QUE_NO_CABE = "x".repeat(300);

    @Autowired private MockMvc mvc;

    @MockBean private AuthenticationService authenticationService;
    @MockBean private UserService userService;
    @MockBean private JWTAuthorizationFilter jwtAuthorizationFilter;
    @MockBean private SecParams secParams;

    private void exigeContrato(String ruta, String cuerpo, String pistaEsperada) throws Exception {
        mvc.perform(post(ruta).contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(400))
                .andExpect(jsonPath("$.message").value(containsString(pistaEsperada)));
    }

    @Nested
    @DisplayName("AuthenticationController")
    class Autenticacion {

        @Test
        @DisplayName("cuerpo vacio")
        void cuerpoVacio() throws Exception {
            exigeContrato("/v1/auth/login", "", "viene vacío");
        }

        @Test
        @DisplayName("campo con tipo incorrecto")
        void tipoIncorrecto() throws Exception {
            exigeContrato("/v1/auth/register",
                    "{\"name\":[1,2],\"email\":\"ana@biblioteca.ah\",\"password\":\"Password123!\"}",
                    "'name'");
        }

        @Test
        @DisplayName("texto demasiado largo")
        void textoDemasiadoLargo() throws Exception {
            exigeContrato("/v1/auth/register",
                    "{\"name\":\"" + TEXTO_QUE_NO_CABE + "\",\"email\":\"ana@biblioteca.ah\","
                            + "\"password\":\"Password123!\"}", "'name'");
        }
    }

    @Nested
    @DisplayName("UserController")
    class Usuarios {

        @Test
        @DisplayName("cuerpo vacio")
        void cuerpoVacio() throws Exception {
            exigeContrato("/v1/users/save", "", "viene vacío");
        }

        @Test
        @DisplayName("campo con tipo incorrecto")
        void tipoIncorrecto() throws Exception {
            exigeContrato("/v1/users/save",
                    "{\"name\":\"Ana\",\"email\":\"ana@biblioteca.ah\",\"id\":\"primero\"}", "'id'");
        }

        @Test
        @DisplayName("texto demasiado largo")
        void textoDemasiadoLargo() throws Exception {
            exigeContrato("/v1/users/save",
                    "{\"name\":\"Ana\",\"email\":\"" + TEXTO_QUE_NO_CABE + "@biblioteca.ah\","
                            + "\"password\":\"Password123!\"}", "'email'");
        }
    }

    @Test
    @DisplayName("una excepcion no capturada tampoco rompe el contrato")
    void excepcionNoCapturada() throws Exception {
        when(userService.getById(anyLong())).thenThrow(new IllegalStateException("boom"));

        mvc.perform(post("/v1/users/get/1").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(500))
                .andExpect(jsonPath("$.message").value(containsString("error inesperado")));
    }
}
