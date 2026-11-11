package com.bibliotecaah.biblioteca.dto.output;

import com.bibliotecaah.biblioteca.dto.input.ProgresoDTO;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/** EjemplarDTO + capitulos (de estructura.json) + progreso. */
@Getter
@Setter
@NoArgsConstructor
public class EjemplarDetalleDTO extends EjemplarDTO {
    private List<CapituloDTO> capitulos = new ArrayList<>();
    private ProgresoDTO progreso;
}
