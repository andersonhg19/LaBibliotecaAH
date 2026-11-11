package com.bibliotecaah.biblioteca.security;

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

    /** SECRET es obligatorio: sin el, el servicio no arranca (ver auth-service). */
    @PostConstruct
    void exigirSecreto() {
        exigir(secret);
    }

    static void exigir(String secreto) {
        if (secreto == null || secreto.isBlank()) {
            throw new IllegalStateException(
                    "Falta la variable de entorno SECRET (clave para verificar los JWT). "
                            + "Definela en el .env antes de arrancar el servicio.");
        }
    }
}
