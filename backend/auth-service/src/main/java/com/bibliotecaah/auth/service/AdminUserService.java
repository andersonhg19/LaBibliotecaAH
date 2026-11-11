package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AsignarRolesDTO;
import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface AdminUserService {

    ResultDTO getAll(UserFilterDTO filter);

    ResultDTO getById(Long id);

    ResultDTO crear(UserSaveDTO dto);

    /** Edita nombre, correo y alias de otra cuenta (el alias, si no llega, se conserva). */
    ResultDTO actualizar(UserSaveDTO dto);

    ResultDTO asignarRoles(Long userId, AsignarRolesDTO dto);

    ResultDTO cambiarActivacion(Long userId, boolean activar);
}
