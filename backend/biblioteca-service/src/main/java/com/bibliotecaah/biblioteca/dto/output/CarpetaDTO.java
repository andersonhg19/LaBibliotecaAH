package com.bibliotecaah.biblioteca.dto.output;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** (v1.6) Una carpeta con su cuenta: documentos de todo su subarbol y subcarpetas directas. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CarpetaDTO {
    private UUID id;
    private String nombre;
    private UUID padreId;
    private long nDocumentos;
    private long nSubcarpetas;

    /* Lombok generaria getNDocumentos(), que Jackson publica como "ndocumentos". */
    @JsonProperty("nDocumentos")
    public long getNDocumentos() {
        return nDocumentos;
    }

    @JsonProperty("nSubcarpetas")
    public long getNSubcarpetas() {
        return nSubcarpetas;
    }
}
