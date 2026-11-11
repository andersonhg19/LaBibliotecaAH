package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.dto.output.ResultDTO;

public final class ValidationUtils {

    private ValidationUtils() {}

    public static ResultDTO error(String message, int errorCode) {
        return new ResultDTO(false, message, errorCode);
    }

    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
