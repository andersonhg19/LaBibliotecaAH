package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;

public interface AuthenticationService {

    AuthenticationResponse authenticate(AuthenticationRequest request);
}
