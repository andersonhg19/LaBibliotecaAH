package com.bibliotecaah.auth.dto.output;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ResultUserDTO {

    private Long id;
    private String name;
    private String email;
    private String alias;
    private Boolean active;

    /**
     * Token nuevo cuando la operacion revoco las sesiones de la cuenta (cambio
     * de la propia contrasena, QA SE-02). La web debe reemplazar el que tiene;
     * null en el resto de casos.
     */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String token;
}
