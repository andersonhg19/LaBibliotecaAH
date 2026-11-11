package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.RoleSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface RoleService {

    ResultDTO getAll();

    ResultDTO saveAndUpdate(RoleSaveDTO dto);

    ResultDTO desactivar(Long id);
}
