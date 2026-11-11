package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Datos de un registro publico. Existe por seguridad, no por estilo.
 *
 * /v1/auth/register es la unica ruta abierta sin token. Antes recibia un
 * UserSaveDTO, que lleva campo "id", y el servicio interpretaba "trae id" como
 * "esto es una actualizacion". Consecuencia: cualquiera, SIN autenticarse,
 * podia enviar {"id":3,"email":"suyo@…","password":"…"} y quedarse con la
 * cuenta de otro cambiandole el correo y la contrasena.
 *
 * Este DTO no tiene id, asi que esa ruta ya no puede actualizar nada.
 * Actualizar un usuario vive solo en /v1/users/save, que exige token.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserRegisterDTO {

    /**
     * Al menos una letra y un numero. Junto con el minimo de 8 caracteres es
     * la politica de contrasenas para altas y cambios; antes valia "123456".
     */
    public static final String CLAVE_CON_LETRA_Y_NUMERO = "^(?=.*\\p{L})(?=.*\\d).*$";

    @NotBlank(message = "es obligatorio")
    @Size(max = 100, message = "no puede superar los 100 caracteres")
    private String name;

    @NotBlank(message = "es obligatorio")
    @Email(message = "no tiene formato de correo valido")
    @Size(max = 150, message = "no puede superar los 150 caracteres")
    private String email;

    @NotBlank(message = "es obligatorio")
    @Size(min = 8, max = 100, message = "debe tener entre 8 y 100 caracteres")
    @Pattern(regexp = CLAVE_CON_LETRA_Y_NUMERO, message = "debe tener al menos una letra y un numero")
    private String password;
}
