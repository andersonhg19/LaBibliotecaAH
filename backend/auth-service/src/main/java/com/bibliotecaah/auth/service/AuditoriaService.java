package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AuditoriaFilterDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;

public interface AuditoriaService {

    ResultDTO consultar(AuditoriaFilterDTO filtro);
}
