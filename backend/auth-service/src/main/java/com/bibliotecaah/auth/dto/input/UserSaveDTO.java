package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserSaveDTO {

    private Long id;

    @NotBlank(message = "es obligatorio")
    @Size(max = 100, message = "no puede superar los 100 caracteres")
    private String name;

    @NotBlank(message = "es obligatorio")
    @Email(message = "no tiene formato de correo valido")
    @Size(max = 150, message = "no puede superar los 150 caracteres")
    private String email;

    /* Contrasena nueva. Nulo = no se cambia. Solo se exige la politica a la
       que llega: las contrasenas ya guardadas no se tocan. */
    @Size(min = 8, max = 100, message = "debe tener entre 8 y 100 caracteres")
    @Pattern(regexp = UserRegisterDTO.CLAVE_CON_LETRA_Y_NUMERO,
            message = "debe tener al menos una letra y un numero")
    private String password;

    /**
     * La contrasena actual. Obligatoria para cambiar la PROPIA contrasena por
     * /v1/users/save: sin ella, un token robado bastaba para quedarse con la
     * cuenta cambiandole la clave (QA A3).
     */
    @Size(max = 100, message = "no puede superar los 100 caracteres")
    private String currentPassword;
}
