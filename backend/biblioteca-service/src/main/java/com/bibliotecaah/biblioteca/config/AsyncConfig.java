package com.bibliotecaah.biblioteca.config;

import org.springframework.beans.factory.annotation.Value;
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

    /**
     * Traduccion de capitulos en segundo plano (contratos v1.3). Pocos hilos (el traductor
     * es una CPU compartida con el taller) y cola acotada con AbortPolicy: si se llena, quien
     * pide recibe "traductor ocupado" (429) en vez de acumular trabajo sin fin.
     */
    @Bean(name = "ejecutorDeTraducciones")
    public ThreadPoolTaskExecutor ejecutorDeTraducciones(
            @Value("${biblioteca.traductor.hilos:1}") int hilos,
            @Value("${biblioteca.traductor.cola:20}") int cola) {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setCorePoolSize(hilos);
        ejecutor.setMaxPoolSize(hilos);
        ejecutor.setQueueCapacity(cola);
        ejecutor.setThreadNamePrefix("traduccion-");
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        ejecutor.setWaitForTasksToCompleteOnShutdown(false);
        ejecutor.initialize();
        return ejecutor;
    }
}
