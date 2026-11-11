package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;

public interface AuthenticationService {

    default AuthenticationResponse authenticate(AuthenticationRequest request) {
        return authenticate(request, null);
    }

    /** @param origen dispositivo de origen (ver OrigenDeLaPeticion); null = desconocido */
    AuthenticationResponse authenticate(AuthenticationRequest request, String origen);

    /**
     * Token nuevo para la sesion del token actual (QA SE-02: tokens cortos con
     * renovacion). Vacio si la cuenta ya no esta activa.
     */
    java.util.Optional<AuthenticationResponse> renovar(Long userId);
}
