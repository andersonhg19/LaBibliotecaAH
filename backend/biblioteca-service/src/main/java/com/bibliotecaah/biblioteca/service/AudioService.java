package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.AudioEstadoPeticionDTO;
import com.bibliotecaah.biblioteca.dto.output.AudioEstadoDTO;

public interface AudioService {

    AudioEstadoDTO estado(AudioEstadoPeticionDTO peticion);
}
