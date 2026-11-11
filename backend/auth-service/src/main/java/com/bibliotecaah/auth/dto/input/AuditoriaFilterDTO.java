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
public class AuditoriaFilterDTO {

    private Long actorUserId;
    private String entityType;

    /** Cuantos dias hacia atras. Sin esto, la consulta trae la tabla entera. */
    @Min(1)
    @Max(3650)
    private Integer ultimosDias;

    @Min(0)
    private int page = 0;

    @Min(1)
    @Max(200)
    private int size = 50;
}
