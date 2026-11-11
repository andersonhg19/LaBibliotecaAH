package com.bibliotecaah.auth.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Lo que hace falta para que la auditoria escriba en otro hilo y se limpie
 * sola.
 *
 * EL EJECUTOR ES PROPIO Y PEQUENO, no el de por defecto. El de Spring Boot
 * tiene una cola practicamente sin limite: si la base de datos se pone lenta,
 * las tareas se acumulan ahi hasta que se acaba la memoria, y el sintoma seria
 * que se cae el servicio de autenticacion entero por culpa de su registro de
 * auditoria.
 *
 * Aqui la cola tiene tope y la politica de rechazo es CallerRunsPolicy: cuando
 * se llena, la escritura la hace el hilo que la pidio. Eso frena un poco esa
 * peticion —que es visible y molesto— en vez de reventar el proceso, que es
 * invisible hasta que ya paso.
 */
@Configuration
@EnableAsync
@EnableScheduling
@ConditionalOnProperty(name = "audit.enabled", havingValue = "true", matchIfMissing = true)
public class AuditoriaConfig {

    @Bean(name = "auditExecutor")
    public Executor auditExecutor() {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setCorePoolSize(1);
        ejecutor.setMaxPoolSize(2);
        ejecutor.setQueueCapacity(500);
        ejecutor.setThreadNamePrefix("auditoria-");
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        ejecutor.initialize();
        return ejecutor;
    }
}
