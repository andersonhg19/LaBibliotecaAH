package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultRoleDTO {

    private Long id;
    private String name;
    private String description;
    private Boolean active;

    /** Cuantas cuentas activas lo llevan puesto. */
    private Long usuarios;
}
