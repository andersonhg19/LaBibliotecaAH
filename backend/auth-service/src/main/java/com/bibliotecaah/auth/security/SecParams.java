package com.bibliotecaah.auth.security;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@NoArgsConstructor
@Getter
@Component
public class SecParams {

    @Value("${secret:}")
    private String secret;

    @Value("${expired-time}")
    private Long expiredTime;

    /**
     * SECRET es obligatorio. En Oh Churus tenia un valor por defecto escrito en
     * el codigo: si el despliegue olvidaba la variable, los tokens se firmaban
     * con una clave publica en el repositorio. Aqui el servicio no arranca.
     */
    @PostConstruct
    void exigirSecreto() {
        exigir(secret);
    }

    static void exigir(String secreto) {
        if (secreto == null || secreto.isBlank()) {
            throw new IllegalStateException(
                    "Falta la variable de entorno SECRET (clave para firmar los JWT). "
                            + "Definela en el .env antes de arrancar el servicio.");
        }
    }
}
