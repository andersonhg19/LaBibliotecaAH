package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * El menu que le corresponde a quien pregunta.
 *
 * Lo que devuelve NO es "todo lo que existe con una marca de si puedes":
 * es solo lo que esa persona puede ver. La diferencia importa — mandar la
 * lista completa y que el movil esconda lo que no toca deja el catalogo de
 * pantallas de administracion viajando hasta el telefono de cualquiera.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultMenuDTO {

    private List<ModuloDTO> modules = new ArrayList<>();

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModuloDTO {
        private String code;
        private String name;
        private String icon;
        private Integer sortOrder;
        private List<PaginaDTO> pages = new ArrayList<>();
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PaginaDTO {
        private String code;
        private String name;
        private String route;
        private String icon;
        private Boolean inMenu;
        private Integer sortOrder;
        private Boolean canRead;
        private Boolean canCreate;
        private Boolean canUpdate;
        private Boolean canDelete;
    }
}
