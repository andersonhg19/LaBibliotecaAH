package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.repository.TraduccionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Purga una vez al dia los textos sueltos traducidos que llevan {@code dias} sin usarse
 * (bah_lib_traduccion, V3): la cache no crece sin fin. Si falla, deja log y espera a manana.
 */
@Slf4j
@Component
public class TareaCacheDeTraducciones {

    private final TraduccionRepository cache;
    private final int dias;

    public TareaCacheDeTraducciones(TraduccionRepository cache,
                                    @Value("${biblioteca.traductor.cache-dias:180}") int dias) {
        this.cache = cache;
        this.dias = dias;
    }

    @Scheduled(fixedDelayString = "${biblioteca.tareas.traducciones-ms:86400000}", initialDelay = 300000)
    public void revisar() {
        try {
            int borradas = cache.purgar(dias);
            if (borradas > 0) log.info("Cache de traducciones: {} texto(s) sin usar en {} dias borrados", borradas, dias);
        } catch (RuntimeException e) {
            log.error("La purga de la cache de traducciones fallo; se reintenta en la siguiente pasada", e);
        }
    }
}
