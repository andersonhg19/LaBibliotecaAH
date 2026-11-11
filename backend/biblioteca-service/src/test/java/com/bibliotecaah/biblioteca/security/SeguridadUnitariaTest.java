package com.bibliotecaah.biblioteca.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Seguridad sin contexto de Spring")
class SeguridadUnitariaTest {

    @Nested
    @DisplayName("SecParams")
    class Secreto {

        @Test
        @DisplayName("sin SECRET no arranca y lo dice; con SECRET si")
        void exigeSecreto() {
            SecParams p = new SecParams();
            ReflectionTestUtils.setField(p, "secret", " ");
            assertThatThrownBy(p::exigirSecreto).isInstanceOf(IllegalStateException.class)
                    .hasMessageStartingWith("Falta la variable de entorno SECRET");
            assertThatThrownBy(() -> SecParams.exigir(null)).isInstanceOf(IllegalStateException.class);
            ReflectionTestUtils.setField(p, "secret", "clave");
            assertThatCode(p::exigirSecreto).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Token en la URL")
    class TokenEnUrl {

        private MockHttpServletRequest peticion(String metodo, String contexto, String uri) {
            MockHttpServletRequest r = new MockHttpServletRequest(metodo, uri);
            r.setContextPath(contexto);
            return r;
        }

        @Test
        @DisplayName("solo GET/HEAD de archivos y muestras de voz aceptan ?t=")
        void soloBinarios() {
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("GET", "/biblioteca", "/biblioteca/v1/archivos/x/libro.epub"))).isTrue();
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("HEAD", "", "/v1/voces/edge.a/muestra.mp3"))).isTrue();
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("GET", null, "/v1/voces/edge.a/muestra.mp3"))).isTrue();
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("POST", "/biblioteca", "/biblioteca/v1/archivos/x"))).isFalse();
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("GET", "/biblioteca", "/biblioteca/v1/libros/all"))).isFalse();
            assertThat(JWTAuthorizationFilter.aceptaTokenEnUrl(peticion("GET", "/otro", "/biblioteca/v1/archivos/x"))).isFalse();
        }
    }
}
