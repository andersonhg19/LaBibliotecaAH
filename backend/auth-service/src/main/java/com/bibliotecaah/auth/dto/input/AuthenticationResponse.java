package com.bibliotecaah.auth.dto.input;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AuthenticationResponse {

    private String token;
    private String email;
    private String name;
    private Long userId;

    /**
     * Los mismos roles que van firmados dentro del token, repetidos aqui para
     * que el front no tenga que descodificar el JWT solo para saber si pintar
     * el menu de administracion. Lo que MANDA es el claim del token: esta lista
     * es comodidad de pintado, nunca la fuente de una decision de seguridad,
     * que se toma siempre en el servidor.
     */
    private List<String> roles = new ArrayList<>();
}
