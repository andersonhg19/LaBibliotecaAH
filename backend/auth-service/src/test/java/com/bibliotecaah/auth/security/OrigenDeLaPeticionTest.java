package com.bibliotecaah.auth.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Origen de un login a partir de X-Forwarded-For (QA SE-08)")
class OrigenDeLaPeticionTest {

    private static MockHttpServletRequest con(String xff) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRemoteAddr("172.20.0.5");
        if (xff != null) r.addHeader("X-Forwarded-For", xff);
        return r;
    }

    @Test
    @DisplayName("con Tailscale serve y gateway (2 saltos) toma la entrada que anadio Tailscale")
    void dosSaltos() {
        assertThat(OrigenDeLaPeticion.de(con("100.64.0.7, 172.20.0.1"), 2)).isEqualTo("100.64.0.7");
    }

    @Test
    @DisplayName("lo que invente el cliente a la izquierda no cuenta")
    void clienteMentiroso() {
        assertThat(OrigenDeLaPeticion.de(con("1.2.3.4, 9.9.9.9 ,100.64.0.7, 172.20.0.1"), 2)).isEqualTo("100.64.0.7");
    }

    @Test
    @DisplayName("con menos entradas que saltos toma la primera; con 1 salto, la ultima")
    void pocasEntradas() {
        assertThat(OrigenDeLaPeticion.de(con("172.20.0.1"), 2)).isEqualTo("172.20.0.1");
        assertThat(OrigenDeLaPeticion.de(con("1.2.3.4, 172.20.0.1"), 1)).isEqualTo("172.20.0.1");
        assertThat(OrigenDeLaPeticion.de(con("1.2.3.4, 172.20.0.1"), 0)).isEqualTo("172.20.0.1");
    }

    @Test
    @DisplayName("sin cabecera o vacia, la IP de la conexion")
    void sinCabecera() {
        assertThat(OrigenDeLaPeticion.de(con(null), 2)).isEqualTo("172.20.0.5");
        assertThat(OrigenDeLaPeticion.de(con(" , "), 2)).isEqualTo("172.20.0.5");
    }
}
