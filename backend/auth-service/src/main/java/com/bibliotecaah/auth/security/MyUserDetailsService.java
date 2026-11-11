package com.bibliotecaah.auth.security;

import com.bibliotecaah.auth.entity.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;

/**
 * Carga la cuenta para comprobar la clave. El "username" que llega es lo que la
 * persona escribio: su correo o su alias (ver IdentidadDeLogin). El UserDetails
 * que sale lleva siempre el CORREO como nombre, que es el sujeto del token.
 */
@Service
public class MyUserDetailsService implements UserDetailsService {

    private final IdentidadDeLogin identidades;

    public MyUserDetailsService(IdentidadDeLogin identidades) {
        this.identidades = identidades;
    }

    @Override
    public UserDetails loadUserByUsername(String identificador) throws UsernameNotFoundException {
        /* El mensaje no repite lo que se escribio: Spring lo convierte en
           "credenciales incorrectas" de todas formas y asi no acaba en un log. */
        User user = identidades.buscarActiva(identificador)
                .orElseThrow(() -> new UsernameNotFoundException("No hay cuenta activa con ese correo o usuario"));

        return new org.springframework.security.core.userdetails.User(
                user.getEmail(),
                user.getPassword(),
                user.getActive(),
                true, true, true,
                Collections.emptyList()
        );
    }
}
