package com.bibliotecaah.auth.dto.input;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Inicio de sesion con correo O alias (V3).
 *
 * `usuario` es el campo nuevo y admite las dos cosas. `email` se conserva como
 * SINONIMO para los clientes que ya existen: si llega solo `email`, se usa ese
 * (y tambien puede traer un alias). Por eso ya no lleva @Email: rechazar
 * "anderson" en ese campo romperia justo lo que se quiere permitir.
 *
 * Que falten los dos lo resuelve el controller con un mensaje claro
 * (usuarioObligatorio), no la validacion del DTO, que no sabe de "uno u otro".
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AuthenticationRequest {

    @Schema(description = "Correo o alias de la cuenta", example = "anderson")
    private String usuario;

    @Schema(description = "Sinonimo retrocompatible de 'usuario' (correo o alias)",
            example = "anderson@biblioteca.ah", deprecated = true)
    private String email;

    @NotBlank(message = "es obligatorio")
    @Schema(example = "Clave1234")
    private String password;

    /** Lo que se escribio para identificarse: `usuario` y, si no llego, `email`. */
    @JsonIgnore
    @Schema(hidden = true)
    public String getIdentificador() {
        return (usuario != null && !usuario.isBlank()) ? usuario : email;
    }
}
