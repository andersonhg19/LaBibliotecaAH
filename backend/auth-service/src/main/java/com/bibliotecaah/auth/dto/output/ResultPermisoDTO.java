package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultPermisoDTO {

    private Long pageId;
    private String moduleCode;
    private String pageCode;
    private String pageName;
    private Boolean canRead;
    private Boolean canCreate;
    private Boolean canUpdate;
    private Boolean canDelete;
}
