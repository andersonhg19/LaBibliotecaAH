package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AppConfigSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface PreferenciasService {

    /** Nombre de la app e idioma regional, ya resueltos. */
    ResultDTO misPreferencias();

    /** Los ajustes de la instalacion. Solo administracion. */
    ResultDTO getConfiguracion();

    ResultDTO guardarConfiguracion(AppConfigSaveDTO dto);
}
