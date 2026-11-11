package com.bibliotecaah.auth.mapper;

import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.entity.User;

public interface UserMapper {

    ResultUserDTO toResultDTO(User user);

    User toEntity(ResultUserDTO dto);
}
