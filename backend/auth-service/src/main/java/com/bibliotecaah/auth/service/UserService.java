package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface UserService {

    /**
     * Alta publica. SIEMPRE crea: no puede actualizar nada, porque es la unica
     * ruta a la que se llega sin token. Ver UserRegisterDTO.
     */
    ResultDTO register(UserRegisterDTO dto);

    ResultDTO saveAndUpdate(UserSaveDTO dto);

    ResultDTO getById(Long id);

    ResultDTO getAll(UserFilterDTO filter);

    ResultDTO delete(Long id);
}
