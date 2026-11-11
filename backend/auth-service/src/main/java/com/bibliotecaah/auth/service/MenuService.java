package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface MenuService {

    /** El menu de quien hace la peticion, segun los roles que trae su token. */
    ResultDTO miMenu();
}
