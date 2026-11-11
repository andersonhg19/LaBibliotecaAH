package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.security.DemasiadosIntentosException;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/auth")
public class AuthenticationController {

    private final AuthenticationService authenticationService;
    private final UserService userService;

    public AuthenticationController(AuthenticationService authenticationService, UserService userService) {
        this.authenticationService = authenticationService;
        this.userService = userService;
    }

    @PostMapping(value = "/login", produces = "application/json")
    public ResponseEntity<ResultDTO> login(@Valid @RequestBody AuthenticationRequest request) {
        try {
            AuthenticationResponse response = authenticationService.authenticate(request);
            return ResponseEntity.ok(new ResultDTO(response));
        } catch (BadCredentialsException e) {
            /* El mismo mensaje exista o no el correo: no se confirma quien
               tiene cuenta. */
            return ResponseEntity.ok(new ResultDTO(false, CREDENCIALES_INCORRECTAS, 101));
        } catch (DemasiadosIntentosException e) {
            return ResponseEntity.ok(new ResultDTO(false, DEMASIADOS_INTENTOS, 429));
        }
    }

    static final String CREDENCIALES_INCORRECTAS = "Correo o contraseña incorrectos";
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
        ResultDTO creado = userService.register(request);
        if (!creado.isCorrect()) {
            return ResponseEntity.ok(creado);
        }
        try {
            AuthenticationResponse sesion = authenticationService.authenticate(
                    new AuthenticationRequest(request.getEmail(), request.getPassword()));
            return ResponseEntity.ok(new ResultDTO(sesion));
        } catch (DemasiadosIntentosException e) {
            /* Raro pero posible: alguien fallo logins con ese correo antes de
               que existiera la cuenta. La cuenta ya quedo creada. */
            return ResponseEntity.ok(new ResultDTO(false,
                    "Tu cuenta quedó creada, pero hubo demasiados intentos con ese correo. "
                            + "Espera unos minutos e inicia sesión.", 429));
        }
    }
}
