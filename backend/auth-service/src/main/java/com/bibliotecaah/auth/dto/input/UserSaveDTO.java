package com.bibliotecaah.auth.dto.input;

import io.swagger.v3.oas.annotations.media.Schema;
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
    @Email(message = "no tiene formato de correo válido")
    @Size(max = 150, message = "no puede superar los 150 caracteres")
    private String email;

    /** Recortado al llegar (QA SE-04): " ana@x.co " es un correo valido; las minusculas las pone el servicio. */
    public void setEmail(String email) {
        this.email = email == null ? null : email.trim();
    }

    /**
     * Alias (V3). Opcional al EDITAR: si no llega, la cuenta conserva el que
     * tiene (asi los clientes que no lo conocen no lo borran). Obligatorio en
     * el alta de administracion. Formato y unicidad: ValidacionDeAlias.
     */
    @Size(max = 100, message = "no puede superar los 100 caracteres")
    @Schema(description = "Alias para iniciar sesion: 3-30 caracteres [a-z0-9._-], sin @. "
            + "Al editar, si no llega se conserva", example = "anderson")
    private String alias;

    /* Contrasena nueva. Nulo = no se cambia. Solo se exige la politica a la
       que llega: las contrasenas ya guardadas no se tocan. */
    @Size(min = 10, max = 100, message = "debe tener entre 10 y 100 caracteres")
    @Pattern(regexp = UserRegisterDTO.CLAVE_CON_LETRA_Y_NUMERO,
            message = "debe tener al menos una letra y un número")
    private String password;

    /**
     * La contrasena actual. Obligatoria para cambiar la PROPIA contrasena por
     * /v1/users/save: sin ella, un token robado bastaba para quedarse con la
     * cuenta cambiandole la clave (QA A3).
     */
    @Size(max = 100, message = "no puede superar los 100 caracteres")
    private String currentPassword;
}
