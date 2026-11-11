package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultModuleDTO {

    private Long id;
    private String code;
    private String name;
    private String icon;
    private Integer sortOrder;
    private Boolean active;
    private List<ResultPageDTO> pages = new ArrayList<>();

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResultPageDTO {
        private Long id;
        private String code;
        private String name;
        private String route;
        private String icon;
        private Boolean inMenu;
        private Integer sortOrder;
        private Boolean active;
    }
}
