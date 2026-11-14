package com.bibliotecaah.biblioteca.service;

import com.bibliotecaah.biblioteca.dto.input.AudioEstadoPeticionDTO;
import com.bibliotecaah.biblioteca.dto.input.PrepararLibroDTO;
import com.bibliotecaah.biblioteca.dto.output.AudioEstadoDTO;
import com.bibliotecaah.biblioteca.dto.output.PreparacionLibroDTO;

import java.util.UUID;

public interface AudioService {

    AudioEstadoDTO estado(AudioEstadoPeticionDTO peticion);

    /**
     * (0.4.0, C5) "Preparar el libro entero": encola con prioridad baja todos los
     * capitulos con enVoz=true sin audio LISTO (ni en cola, ni en ERROR). Idempotente.
     */
    PreparacionLibroDTO preparar(PrepararLibroDTO peticion);

    /** (0.4.0, C5) Cuantos capitulos con enVoz=true estan listos, en cola o en error en esa voz. */
    PreparacionLibroDTO preparacion(UUID ejemplarId, String vozId);
}
