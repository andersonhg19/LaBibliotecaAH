package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RoleSaveDTO {

    private Long id;

    /**
     * El nombre acaba dentro del token y se compara letra a letra en
     * hasAuthority(...). Por eso se restringe la forma aqui: mayusculas,
     * numeros y guion bajo. Un rol llamado "Admin " —con un espacio al final—
     * no coincidiria nunca con nada y el fallo seria invisible.
     */
    @NotBlank(message = "es obligatorio")
    @Size(max = 50, message = "no puede superar los 50 caracteres")
    @Pattern(regexp = "^[A-Z][A-Z0-9_]*$",
            message = "solo admite mayusculas, numeros y guion bajo, y empieza por letra")
    private String name;

    @Size(max = 200, message = "no puede superar los 200 caracteres")
    private String description;

    private Boolean active;
}
