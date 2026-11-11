package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeseoDTO {
    @NotBlank(message = "{validacion.obligatorio}")
    @Size(max = 500, message = "{validacion.maximo}")
    private String titulo;
    @Size(max = 300, message = "{validacion.maximo}")
    private String autor;
    @Size(max = 20, message = "{validacion.maximo}")
    private String isbn;
    private String nota;
}
