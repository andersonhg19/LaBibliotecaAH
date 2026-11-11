package com.bibliotecaah.auth.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("SECRET es obligatorio")
class SecParamsTest {

    @Test
    @DisplayName("sin SECRET el servicio no arranca, con un mensaje que dice que falta")
    void sinSecretoNoArranca() {
        SecParams p = new SecParams();
        ReflectionTestUtils.setField(p, "secret", "");
        assertThatThrownBy(p::exigirSecreto)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SECRET");
        assertThatThrownBy(() -> SecParams.exigir(null)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("con SECRET arranca")
    void conSecreto() {
        SecParams p = new SecParams();
        ReflectionTestUtils.setField(p, "secret", "una-clave");
        assertThatCode(p::exigirSecreto).doesNotThrowAnyException();
    }
}
