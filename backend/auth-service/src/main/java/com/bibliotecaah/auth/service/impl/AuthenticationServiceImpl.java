package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.AuthenticationRequest;
import com.bibliotecaah.auth.dto.input.AuthenticationResponse;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.security.DemasiadosIntentosException;
import com.bibliotecaah.auth.security.EmisorDeTokens;
import com.bibliotecaah.auth.security.IdentidadDeLogin;
import com.bibliotecaah.auth.security.LimiteDeIntentosDeLogin;
import com.bibliotecaah.auth.service.AuthenticationService;
import com.bibliotecaah.auth.service.CambioAuditable;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Slf4j
@Service
public class AuthenticationServiceImpl implements AuthenticationService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final EmisorDeTokens tokens;
    private final ApplicationEventPublisher eventos;
    private final LimiteDeIntentosDeLogin limiteDeIntentos;
    private final IdentidadDeLogin identidades;

    public AuthenticationServiceImpl(AuthenticationManager authenticationManager,
                                     UserRepository userRepository,
                                     EmisorDeTokens tokens,
                                     ApplicationEventPublisher eventos,
                                     LimiteDeIntentosDeLogin limiteDeIntentos,
                                     IdentidadDeLogin identidades) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.tokens = tokens;
        this.eventos = eventos;
        this.limiteDeIntentos = limiteDeIntentos;
        this.identidades = identidades;
    }

    @Override
    public AuthenticationResponse authenticate(AuthenticationRequest request, String origen) {
        /* Correo o alias (V3): la cuenta se resuelve UNA vez y con ella se
           decide el limite de intentos. El limite cuenta por cuenta, no por lo
           escrito: alternar correo y alias de la misma persona no reparte los
           fallos en dos contadores. */
        String identificador = request.getIdentificador();
        Optional<User> cuenta = identidades.buscarActiva(identificador);
        String claveDelLimite = IdentidadDeLogin.claveDelLimite(identificador, cuenta);

        /* Se comprueba ANTES de mirar la contrasena: con la cuenta bloqueada
           ni siquiera la correcta entra, o el limite no frenaria nada. */
        if (limiteDeIntentos.estaBloqueado(claveDelLimite, origen)) {
            log.warn("Login rechazado por exceso de intentos: {}", claveDelLimite);
            throw new DemasiadosIntentosException();
        }
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(identificador, request.getPassword()));
        } catch (BadCredentialsException e) {
            log.warn("Intento de login fallido: {}", claveDelLimite);
            limiteDeIntentos.registrarFallo(claveDelLimite, origen);
            throw new BadCredentialsException("Invalid credentials");
        }
        limiteDeIntentos.registrarExito(claveDelLimite, origen);

        User user = cuenta
                .flatMap(c -> userRepository.findByIdWithRoles(c.getId()))
                .filter(u -> Boolean.TRUE.equals(u.getActive()))
                .orElseThrow(() -> new BadCredentialsException("User not found"));

        /* Los roles viajan EN el token, junto al userId que ya iba desde la ola
           2. Asi el servicio que autoriza no tiene que preguntarle a este en
           cada peticion: lo que decide si pasas o no llega firmado.
           Solo los activos: retirar un rol es desactivarlo, y si un rol
           desactivado siguiera firmandose, retirarlo no serviria de nada hasta
           que caducara el ultimo token emitido. */
        List<String> roles = EmisorDeTokens.rolesActivos(user);
        String jwt = tokens.emitir(user, roles);

        log.info("User authenticated: {}", user.getEmail());

        /* Solo las entradas que SALEN BIEN. Anotar tambien los intentos
           fallidos convertiria la tabla en el sitio donde se acumulan las
           contrasenas mal tecleadas de todo el mundo, que casi siempre son
           la de otro servicio. El limite de intentos es otro problema y se
           resuelve en otro sitio. */
        eventos.publishEvent(new CambioAuditable(
                user.getId(), user.getEmail(), "User", user.getId(),
                AuditLog.Accion.LOGIN, "Entró con los roles " + roles));

        return respuesta(user, roles, jwt);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AuthenticationResponse> renovar(Long userId) {
        return userRepository.findByIdWithRoles(userId)
                .filter(u -> Boolean.TRUE.equals(u.getActive()))
                .map(u -> {
                    List<String> roles = EmisorDeTokens.rolesActivos(u);
                    return respuesta(u, roles, tokens.emitir(u, roles));
                });
    }

    private static AuthenticationResponse respuesta(User user, List<String> roles, String jwt) {
        AuthenticationResponse response = new AuthenticationResponse();
        response.setToken(jwt);
        response.setEmail(user.getEmail());
        response.setName(user.getName());
        response.setAlias(user.getAlias());
        response.setUserId(user.getId());
        response.setRoles(roles);
        return response;
    }
}
