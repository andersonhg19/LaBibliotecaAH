package com.bibliotecaah.biblioteca.dto.output;

import com.bibliotecaah.biblioteca.enums.TipoEstante;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EstanteDTO {
    private UUID id;
    private String nombre;
    private TipoEstante tipo;
    private String colorMadera;
    private long nLibros;

    @JsonProperty("nLibros")
    public long getNLibros() {
        return nLibros;
    }
}
