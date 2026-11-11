package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AppConfigSaveDTO {

    @NotBlank(message = "es obligatorio")
    @Size(max = 80, message = "no puede superar los 80 caracteres")
    private String configKey;

    @NotBlank(message = "es obligatorio")
    @Size(max = 300, message = "no puede superar los 300 caracteres")
    private String value;

    @Size(max = 300, message = "no puede superar los 300 caracteres")
    private String description;
}
