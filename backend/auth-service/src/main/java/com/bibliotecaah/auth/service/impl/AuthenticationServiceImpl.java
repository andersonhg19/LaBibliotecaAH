package com.bibliotecaah.auth.service.impl;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.security.DemasiadosIntentosException;
import com.bibliotecaah.auth.security.LimiteDeIntentosDeLogin;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.CambioAuditable;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Slf4j
@Service
public class AuthenticationServiceImpl implements AuthenticationService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final SecParams secParams;
    private final ApplicationEventPublisher eventos;
    private final LimiteDeIntentosDeLogin limiteDeIntentos;

    public AuthenticationServiceImpl(AuthenticationManager authenticationManager,
                                     UserRepository userRepository,
                                     SecParams secParams,
                                     ApplicationEventPublisher eventos,
                                     LimiteDeIntentosDeLogin limiteDeIntentos) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.secParams = secParams;
        this.eventos = eventos;
        this.limiteDeIntentos = limiteDeIntentos;
    }

    @Override
    public AuthenticationResponse authenticate(AuthenticationRequest request) {
        /* Se comprueba ANTES de mirar la contrasena: con el correo bloqueado
           ni siquiera la correcta entra, o el limite no frenaria nada. */
        if (limiteDeIntentos.estaBloqueado(request.getEmail())) {
            log.warn("Login rechazado por exceso de intentos: {}", request.getEmail());
            throw new DemasiadosIntentosException();
        }
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (BadCredentialsException e) {
            log.warn("Failed authentication attempt for email: {}", request.getEmail());
            limiteDeIntentos.registrarFallo(request.getEmail());
            throw new BadCredentialsException("Invalid email or password");
        }
        limiteDeIntentos.registrarExito(request.getEmail());

        User user = userRepository.findByEmailAndActiveTrueWithRoles(request.getEmail())
                .orElseThrow(() -> new BadCredentialsException("User not found"));

        /* Los roles viajan EN el token, junto al userId que ya iba desde la ola
           2. Asi el servicio que autoriza no tiene que preguntarle a este en
           cada peticion: lo que decide si pasas o no llega firmado.
           Solo los activos: retirar un rol es desactivarlo, y si un rol
           desactivado siguiera firmandose, retirarlo no serviria de nada hasta
           que caducara el ultimo token emitido. */
        List<String> roles = user.getRoles().stream()
                .filter(rol -> Boolean.TRUE.equals(rol.getActive()))
                .map(Role::getName)
                .sorted()
                .toList();

        String jwt = JWT.create()
                .withSubject(user.getEmail())
                .withClaim("userId", user.getId())
                .withClaim("name", user.getName())
                .withArrayClaim("roles", roles.toArray(new String[0]))
                .withExpiresAt(new Date(System.currentTimeMillis() + secParams.getExpiredTime()))
                .sign(Algorithm.HMAC256(secParams.getSecret()));

        log.info("User authenticated: {}", user.getEmail());

        /* Solo las entradas que SALEN BIEN. Anotar tambien los intentos
           fallidos convertiria la tabla en el sitio donde se acumulan las
           contrasenas mal tecleadas de todo el mundo, que casi siempre son
           la de otro servicio. El limite de intentos es otro problema y se
           resuelve en otro sitio. */
        eventos.publishEvent(new CambioAuditable(
                user.getId(), user.getEmail(), "User", user.getId(),
                AuditLog.Accion.LOGIN, "Entro con los roles " + roles));

        AuthenticationResponse response = new AuthenticationResponse();
        response.setToken(jwt);
        response.setEmail(user.getEmail());
        response.setName(user.getName());
        response.setUserId(user.getId());
        response.setRoles(roles);
        return response;
    }
}
