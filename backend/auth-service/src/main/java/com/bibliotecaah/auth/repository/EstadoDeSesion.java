package com.bibliotecaah.auth.repository;

/** Lo que el filtro JWT necesita para saber si un token sigue valiendo (QA SE-02). */
public record EstadoDeSesion(Boolean activa, Integer version) {

    /** ¿Un token con esta version (null = token anterior a V4 = 0) sigue valiendo? */
    public boolean admite(Integer versionDelToken) {
        int delToken = versionDelToken == null ? 0 : versionDelToken;
        int actual = version == null ? 0 : version;
        return Boolean.TRUE.equals(activa) && delToken == actual;
    }
}
