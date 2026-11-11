package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PermisoSaveDTO {

    @NotBlank(message = "es obligatorio")
    private String roleName;

    @NotNull(message = "es obligatorio")
    private Long pageId;

    @NotNull(message = "es obligatorio")
    private Boolean canRead;

    @NotNull(message = "es obligatorio")
    private Boolean canCreate;

    @NotNull(message = "es obligatorio")
    private Boolean canUpdate;

    @NotNull(message = "es obligatorio")
    private Boolean canDelete;
}
