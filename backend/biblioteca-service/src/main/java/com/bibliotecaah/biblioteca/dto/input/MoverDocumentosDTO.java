package com.bibliotecaah.biblioteca.dto.input;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

/** (v1.6) Mover uno o varios documentos a una carpeta; carpetaId null = a la raiz. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MoverDocumentosDTO {
    @NotEmpty(message = "{validacion.obligatorio}")
    @Size(max = 200, message = "{validacion.maximoElementos}")
    private List<UUID> ejemplarIds;
    private UUID carpetaId;
}
