package com.bibliotecaah.biblioteca.dto.output;

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
public class VozDTO {
    private String id;
    private String nombre;
    private String pais;
    private String genero;
    private String motor;
    private boolean porDefecto;
}
