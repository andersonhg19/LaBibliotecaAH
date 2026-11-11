package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.TraducirCapituloDTO;
import com.bibliotecaah.biblioteca.dto.input.TraducirDTO;
import com.bibliotecaah.biblioteca.dto.output.CapituloTraducidoDTO;
import com.bibliotecaah.biblioteca.dto.output.TraduccionDTO;

public interface TraduccionService {

    TraduccionDTO traducir(TraducirDTO peticion);

    CapituloTraducidoDTO capitulo(TraducirCapituloDTO peticion);
}
