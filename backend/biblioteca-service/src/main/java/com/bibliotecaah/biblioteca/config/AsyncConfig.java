package com.bibliotecaah.biblioteca.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Ejecutor propio y pequeno para el registro de cambios, con cola acotada y
 * CallerRunsPolicy (patron de la auditoria de auth-service): si se llena, frena
 * la peticion en vez de agotar la memoria.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "ejecutorDeCambios")
    public Executor ejecutorDeCambios() {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setCorePoolSize(1);
        ejecutor.setMaxPoolSize(2);
        ejecutor.setQueueCapacity(500);
        ejecutor.setThreadNamePrefix("cambios-");
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        ejecutor.initialize();
        return ejecutor;
    }
}
