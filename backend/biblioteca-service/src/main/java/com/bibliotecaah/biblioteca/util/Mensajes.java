package com.bibliotecaah.biblioteca.util;

import com.bibliotecaah.biblioteca.enums.Message;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** Traduce una clave de Message.Msj al texto de messages_es.properties. */
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
