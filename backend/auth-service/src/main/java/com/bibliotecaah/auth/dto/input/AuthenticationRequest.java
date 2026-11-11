package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AuthenticationRequest {

    @NotBlank(message = "es obligatorio")
    @Email(message = "no tiene formato de correo valido")
    private String email;

    @NotBlank(message = "es obligatorio")
    private String password;
}
