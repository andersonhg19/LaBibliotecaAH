package com.bibliotecaah.auth.controller;

import lombok.extern.slf4j.Slf4j;
import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.security.DemasiadosIntentosException;
import com.bibliotecaah.auth.security.OrigenDeLaPeticion;
import com.bibliotecaah.auth.util.SecurityUtils;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.UserService;
import com.bibliotecaah.auth.util.Mensajes;
import com.bibliotecaah.auth.util.ValidationUtils;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/v1/auth")
public class AuthenticationController {

    private final AuthenticationService authenticationService;
    private final UserService userService;
    private final Mensajes mensajes;

    private final boolean registroPublico;
    private final int proxiesConfiables;

    public AuthenticationController(AuthenticationService authenticationService, UserService userService,
                                    Mensajes mensajes,
                                    @Value("${biblioteca.registro-publico:false}") boolean registroPublico,
                                    @Value("${biblioteca.login.proxies-confiables:2}") int proxiesConfiables) {
        this.registroPublico = registroPublico;
        this.proxiesConfiables = proxiesConfiables;
        /* Auditoria BK-02: el alta publica abierta en produccion seria un agujero
           (cuenta y token para cualquiera que alcance el gateway). Que se vea. */
        if (registroPublico) {
            log.warn("ATENCION: REGISTRO_PUBLICO=true -> cualquiera que alcance el gateway puede crearse una cuenta. "
                    + "En produccion debe ser false (las cuentas las crea un administrador).");
        }
        this.authenticationService = authenticationService;
        this.userService = userService;
        this.mensajes = mensajes;
    }

    @Operation(summary = "Inicia sesion con correo o alias",
            description = "Envia 'usuario' (correo o alias) y 'password'. 'email' se acepta como sinonimo "
                    + "retrocompatible de 'usuario'. Usuario inexistente y clave incorrecta dan el mismo "
                    + "mensaje (errorCode 101); 5 fallos en 5 minutos por cuenta y dispositivo o 20 por dispositivo en 10 minutos frenan (errorCode 429); los fallos repetidos desde un dispositivo responden cada vez mas despacio.")
    @PostMapping(value = "/login", produces = "application/json")
    public ResponseEntity<ResultDTO> login(@Valid @RequestBody AuthenticationRequest request,
                                           HttpServletRequest http) {
        if (ValidationUtils.isBlank(request.getIdentificador())) {
            return ResponseEntity.ok(new ResultDTO(false, mensajes.texto(Message.Msj.usuarioObligatorio), 400));
        }
        try {
            AuthenticationResponse response = authenticationService.authenticate(request,
                    OrigenDeLaPeticion.de(http, proxiesConfiables));
            return ResponseEntity.ok(new ResultDTO(response));
        } catch (BadCredentialsException e) {
            /* El mismo mensaje exista o no la cuenta (por correo o por alias):
               no se confirma quien tiene cuenta. */
            return ResponseEntity.ok(new ResultDTO(false, mensajes.texto(Message.Msj.credencialesIncorrectas), 101));
        } catch (DemasiadosIntentosException e) {
            return ResponseEntity.ok(new ResultDTO(false, DEMASIADOS_INTENTOS, 429));
        }
    }

    static final String DEMASIADOS_INTENTOS = "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";

    /**
     * Alta publica.
     *
     * Dos arreglos en el mismo sitio:
     *
     * 1. SEGURIDAD: recibe UserRegisterDTO, que no tiene campo "id". Antes
     *    recibia UserSaveDTO y llamaba a saveAndUpdate, asi que enviando un id
     *    se ACTUALIZABA a otro usuario —sin token, porque esta ruta es
     *    publica— cambiandole correo y contrasena.
     *
     * 2. FLUJO: devuelve lo mismo que /login (token incluido). El frontend ya
     *    esperaba eso (AuthContext.register lee authData.token), pero el
     *    backend devolvia el usuario sin token, asi que registrarse dejaba a
     *    la persona con una sesion vacia.
     */
    @PostMapping(value = "/register", produces = "application/json")
    public ResponseEntity<ResultDTO> register(@Valid @RequestBody UserRegisterDTO request) {
        /* QA SE-03: en una app privada el alta publica va cerrada por defecto
           (REGISTRO_PUBLICO=false); las cuentas las crea un administrador en
           /v1/admin/users/save. Con la variable en true se comporta como antes. */
        if (!registroPublico) {
            return ResponseEntity.ok(new ResultDTO(false, mensajes.texto(Message.Msj.registroCerrado), 403));
        }
        ResultDTO creado = userService.register(request);
        if (!creado.isCorrect()) {
            return ResponseEntity.ok(creado);
        }
        try {
            AuthenticationResponse sesion = authenticationService.authenticate(
                    new AuthenticationRequest(request.getEmail(), null, request.getPassword()), null);
            return ResponseEntity.ok(new ResultDTO(sesion));
        } catch (DemasiadosIntentosException e) {
            /* Raro pero posible: alguien fallo logins con ese correo antes de
               que existiera la cuenta. La cuenta ya quedo creada. */
            return ResponseEntity.ok(new ResultDTO(false,
                    "Tu cuenta quedó creada, pero hubo demasiados intentos con ese correo. "
                            + "Espera unos minutos e inicia sesión.", 429));
        }
    }

    @Operation(summary = "Renueva el token de la sesion actual",
            description = "Devuelve lo mismo que /login con un token nuevo (misma version de sesion, caducidad "
                    + "contada desde ahora). La web lo llama al abrir y cada pocas horas: asi los tokens pueden ser "
                    + "cortos (EXP_TIME) sin pedir la clave a diario. Con la sesion revocada responde 401.")
    @PostMapping(value = "/renovar", produces = "application/json")
    public ResponseEntity<ResultDTO> renovar() {
        return authenticationService.renovar(SecurityUtils.getAuthenticatedUserId())
                .map(r -> ResponseEntity.ok(new ResultDTO(r)))
                .orElseGet(() -> ResponseEntity.ok(new ResultDTO(false, mensajes.texto(Message.Msj.sesionNoVigente), 401)));
    }

    @Operation(summary = "Comprueba que el token sigue vigente",
            description = "Uso interno de biblioteca-service (QA SE-02): si el token llega hasta aqui, la cuenta "
                    + "esta activa y su version de sesion coincide con la del token; si no, el filtro ya respondio 401.")
    @PostMapping(value = "/sesion", produces = "application/json")
    public ResponseEntity<ResultDTO> sesion() {
        return ResponseEntity.ok(new ResultDTO(Boolean.TRUE));
    }
}
