package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserFilterDTO {

    private String name;
    private String email;
    private Boolean active;
    @Min(0)
    private int page = 0;
    @Min(1) @Max(100)
    private int size = 10;
}
