package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultAppConfigDTO {

    private Long id;
    private String configKey;
    private String value;
    private String description;
    private Boolean active;
}
