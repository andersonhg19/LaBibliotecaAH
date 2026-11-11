package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.enums.Message;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Traduce una clave de Message.Msj al texto de messages_es.properties
 * (estandares §16). Misma pieza que la de biblioteca-service.
 */
@Component
public class Mensajes {

    public static final Locale ESPANOL = Locale.forLanguageTag("es");

    private final MessageSource fuente;

    public Mensajes(MessageSource fuente) {
        this.fuente = fuente;
    }

    public String texto(Message.Msj clave, Object... argumentos) {
        return fuente.getMessage(clave.name(), argumentos, clave.name(), ESPANOL);
    }
}
