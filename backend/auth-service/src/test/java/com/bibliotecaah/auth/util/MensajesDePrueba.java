package com.bibliotecaah.auth.util;

import org.springframework.context.support.ResourceBundleMessageSource;

/** Mensajes con los textos REALES de messages_es.properties, para pruebas sin Spring. */
public final class MensajesDePrueba {

    private MensajesDePrueba() {}

    public static Mensajes reales() {
        ResourceBundleMessageSource fuente = new ResourceBundleMessageSource();
        fuente.setBasename("messages");
        fuente.setDefaultEncoding("UTF-8");
        fuente.setFallbackToSystemLocale(false);
        return new Mensajes(fuente);
    }
}
