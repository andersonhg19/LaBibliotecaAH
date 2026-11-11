package com.bibliotecaah.auth.dto.output;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ResultUserDTO {

    private Long id;
    private String name;
    private String email;
    private Boolean active;
}
