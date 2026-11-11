package com.bibliotecaah.biblioteca.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Las tareas programadas (metadatos y buzon). En las pruebas se apagan. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "biblioteca.tareas.habilitadas", havingValue = "true", matchIfMissing = true)
public class TareasConfig {
}
