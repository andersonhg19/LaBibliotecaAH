package com.bibliotecaah.auth.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;

/** Auditoria BK-02 (caso G2): con REGISTRO_PUBLICO=true el arranque deja un WARN bien visible. */
@DisplayName("El registro publico abierto se avisa en el log")
class ElRegistroPublicoAbiertoSeAvisaTest {

    private final Logger logger = (Logger) LoggerFactory.getLogger(AuthenticationController.class);
    private final ListAppender<ILoggingEvent> lineas = new ListAppender<>();

    @BeforeEach
    void escuchar() {
        lineas.start();
        logger.addAppender(lineas);
        /* logback-test.xml apaga com.bibliotecaah: aqui se enciende solo este logger. */
        logger.setLevel(Level.WARN);
    }

    @AfterEach
    void dejarDeEscuchar() {
        logger.detachAppender(lineas);
        logger.setLevel(null);
    }

    @Test
    @DisplayName("abierto: un WARN que nombra REGISTRO_PUBLICO")
    void abierto() {
        new AuthenticationController(null, null, null, true, 2);

        assertThat(lineas.list).hasSize(1);
        assertThat(lineas.list.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(lineas.list.get(0).getFormattedMessage()).contains("REGISTRO_PUBLICO=true");
    }

    @Test
    @DisplayName("cerrado (lo normal): ningun aviso")
    void cerrado() {
        new AuthenticationController(null, null, null, false, 2);

        assertThat(lineas.list).isEmpty();
    }
}
