package com.bibliotecaah.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.security.JWTAuthorizationFilter;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthenticationController.class)
@AutoConfigureMockMvc(addFilters = false)
@org.springframework.context.annotation.Import(com.bibliotecaah.auth.util.Mensajes.class)
class AuthenticationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthenticationService authenticationService;

    @MockBean
    private UserService userService;

    @MockBean
    private JWTAuthorizationFilter jwtAuthorizationFilter;

    @MockBean
    private SecParams secParams;

    @Test
    @DisplayName("POST /v1/auth/login - Should return token on valid login")
    void loginSuccess() throws Exception {
        AuthenticationRequest request = new AuthenticationRequest();
        request.setEmail("test@biblioteca.ah");
        request.setPassword("Password123!");

        AuthenticationResponse authResponse = new AuthenticationResponse();
        authResponse.setToken("jwt-token");
        authResponse.setEmail("test@biblioteca.ah");
        authResponse.setName("Test");
        authResponse.setUserId(1L);

        when(authenticationService.authenticate(any(), any())).thenReturn(authResponse);

        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.token").value("jwt-token"))
                .andExpect(jsonPath("$.object.email").value("test@biblioteca.ah"));
    }

    @Test
    @DisplayName("POST /v1/auth/login - Should return error on invalid credentials")
    void loginFailure() throws Exception {
        AuthenticationRequest request = new AuthenticationRequest();
        request.setEmail("test@biblioteca.ah");
        request.setPassword("wrong");

        when(authenticationService.authenticate(any(), any())).thenThrow(new BadCredentialsException("Invalid"));

        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(101))
                .andExpect(jsonPath("$.message").value("Correo/usuario o contraseña incorrectos"));
    }

    @Test
    @DisplayName("POST /v1/auth/login - con 'usuario' (alias) llega al servicio tal cual")
    void loginConUsuario() throws Exception {
        AuthenticationResponse sesion = new AuthenticationResponse();
        sesion.setToken("jwt");
        sesion.setAlias("anderson");
        when(authenticationService.authenticate(any(), any())).thenReturn(sesion);

        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"usuario\":\"anderson\",\"password\":\"clave-de-prueba\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.alias").value("anderson"));

        org.mockito.ArgumentCaptor<AuthenticationRequest> pedido =
                org.mockito.ArgumentCaptor.forClass(AuthenticationRequest.class);
        verify(authenticationService).authenticate(pedido.capture(), any());
        org.junit.jupiter.api.Assertions.assertEquals("anderson", pedido.getValue().getIdentificador());
    }

    @Test
    @DisplayName("POST /v1/auth/login - un alias en 'email' (cliente viejo) ya no se rechaza por formato")
    void loginAliasEnEmail() throws Exception {
        when(authenticationService.authenticate(any(), any())).thenReturn(new AuthenticationResponse());

        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"anderson\",\"password\":\"clave-de-prueba\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true));
    }

    @Test
    @DisplayName("POST /v1/auth/login - sin usuario ni email: errorCode 400 con mensaje claro, sin llamar al servicio")
    void loginSinUsuario() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"usuario\":\"  \",\"password\":\"clave-de-prueba\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(400))
                .andExpect(jsonPath("$.message").value("Escribe tu correo o tu usuario."));
        verify(authenticationService, never()).authenticate(any(), any());
    }

    @Test
    @DisplayName("POST /v1/auth/login - demasiados intentos: errorCode 429 con mensaje en espanol")
    void loginBloqueado() throws Exception {
        when(authenticationService.authenticate(any(), any()))
                .thenThrow(new com.bibliotecaah.auth.security.DemasiadosIntentosException());

        mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"test@biblioteca.ah\",\"password\":\"lo-que-sea\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(429))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Demasiados intentos")));
    }

    @Test
    @DisplayName("POST /v1/auth/register - contrasena debil (sin numero o corta) se rechaza")
    void registerClaveDebil() throws Exception {
        for (String debil : new String[]{"123456", "abcdefgh", "12345678", "abc1"}) {
            mockMvc.perform(post("/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"N\",\"email\":\"n@biblioteca.ah\",\"password\":\"" + debil + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.correct").value(false))
                    .andExpect(jsonPath("$.message").value(
                            org.hamcrest.Matchers.containsString("'password'")));
        }
        verify(userService, never()).register(any());
    }

    @Test
    @DisplayName("POST /v1/auth/register - registra y devuelve sesion iniciada (token incluido)")
    void registerSuccess() throws Exception {
        UserRegisterDTO dto = new UserRegisterDTO();
        dto.setName("New User");
        dto.setEmail("new@biblioteca.ah");
        dto.setAlias("nuevo");
        dto.setPassword("Password123!");

        when(userService.register(any())).thenReturn(new ResultDTO(true, "OK", 0));

        AuthenticationResponse sesion = new AuthenticationResponse();
        sesion.setToken("jwt-de-prueba");
        sesion.setEmail("new@biblioteca.ah");
        sesion.setName("New User");
        sesion.setUserId(7L);
        when(authenticationService.authenticate(any(), any())).thenReturn(sesion);

        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                /* El frontend lee authData.token nada mas registrarse. Antes el
                   backend devolvia el usuario SIN token y la persona quedaba
                   registrada pero sin sesion. */
                .andExpect(jsonPath("$.object.token").value("jwt-de-prueba"))
                .andExpect(jsonPath("$.object.userId").value(7));
    }

    @Test
    @DisplayName("POST /v1/auth/register - un 'id' en el cuerpo NO puede actualizar a nadie")
    void registerNoPuedeSecuestrarCuentas() throws Exception {
        /* El agujero que hubo: /register es publico y recibia un DTO con campo
           "id"; el servicio interpretaba "trae id" como "actualiza", asi que
           cualquiera SIN token podia cambiarle el correo y la contrasena a otro
           usuario y quedarse con su cuenta.

           Hoy el DTO de registro no tiene id: el campo se ignora y la ruta solo
           puede crear. Se comprueba por el comportamiento, que es lo que
           importa: jamas se llama al metodo que actualiza. */
        when(userService.register(any())).thenReturn(new ResultDTO(true, "OK", 0));
        AuthenticationResponse sesion = new AuthenticationResponse();
        sesion.setToken("t");
        when(authenticationService.authenticate(any(), any())).thenReturn(sesion);

        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":1,\"name\":\"Intruso\",\"email\":\"intruso@evil.com\",\"alias\":\"intruso\","
                                + "\"password\":\"Password123!\"}"))
                .andExpect(status().isOk());

        verify(userService, never()).saveAndUpdate(any());
        verify(userService).register(any());
    }

    /* Estas dos pruebas exigian un 400 de Spring. Certificaban justo lo que
       rompe al frontend: toda la API habla ResultDTO con HTTP 200 y el
       frontend solo sabe leer eso, asi que un 400 en el registro se veia como
       "Request failed with status code 400" en vez de "falta el nombre".
       Ahora se exige 200, correct:false y el nombre del campo malo. */

    @Test
    @DisplayName("POST /v1/auth/register - sin nombre: 200 con correct:false y el campo que falla")
    void registerMissingName() throws Exception {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setEmail("new@biblioteca.ah");
        dto.setPassword("Password123!");
        // name is null -> @NotBlank should fail

        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("'name'")));
    }

    @Test
    @DisplayName("POST /v1/auth/register - correo mal escrito: 200 con correct:false y el campo que falla")
    void registerInvalidEmailFormat() throws Exception {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setName("New User");
        dto.setEmail("not-an-email");
        dto.setPassword("Password123!");

        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("'email'")));
    }

    @Test
    @DisplayName("POST /v1/auth/register - sin alias: 200 con correct:false y el campo 'alias'")
    void registerSinAlias() throws Exception {
        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"N\",\"email\":\"n@biblioteca.ah\",\"password\":\"Clave12345x\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(400))
                .andExpect(jsonPath("$.message").value(
                        "Revisa los datos enviados: el campo 'alias' es obligatorio."));
        verify(userService, never()).register(any());
    }

    @Test
    @DisplayName("POST /v1/auth/register - el error de alias del servicio sale tal cual, sin intentar iniciar sesion")
    void registerAliasRepetido() throws Exception {
        when(userService.register(any())).thenReturn(
                new ResultDTO(false, "Ese nombre de usuario ya está en uso. Prueba con otro.", 112));

        mockMvc.perform(post("/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"N\",\"email\":\"n@biblioteca.ah\",\"alias\":\"samy\","
                                + "\"password\":\"Clave12345x\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(112));
        verify(authenticationService, never()).authenticate(any(), any());
    }
}
