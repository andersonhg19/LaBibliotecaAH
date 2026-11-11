package com.bibliotecaah.auth.dto.output;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * La ficha de un usuario VISTA POR UN ADMINISTRADOR.
 *
 * Es un DTO aparte de ResultUserDTO a proposito, y no un campo mas dentro de
 * aquel. Dos motivos:
 *
 *  1. ResultUserDTO es lo que cada quien recibe de si mismo, y lo pinta el
 *     movil. Anadirle los roles obligaria a cargar la relacion perezosa en
 *     cada peticion de perfil —una consulta extra por usuario— para un dato
 *     que esa pantalla no usa.
 *
 *  2. Aqui hay campos que el autoservicio no debe devolver nunca (cuando se
 *     creo la cuenta, si esta desactivada). Tenerlos en una clase distinta
 *     hace imposible que se escapen por el endpoint equivocado.
 */
@Getter
@Setter
@NoArgsConstructor
public class ResultAdminUserDTO {

    private Long id;
    private String name;
    private String email;
    private Boolean active;
    private List<String> roles = new ArrayList<>();
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
