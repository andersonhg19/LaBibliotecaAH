package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.repository.DiarioRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * (0.5.0, C9) Retencion del diario del reproductor: una vez al dia borra lo creado hace mas de
 * {@code dias} (30), como TareaCacheDeTraducciones. Si falla, deja log y espera a la siguiente pasada.
 */
@Slf4j
@Component
public class TareaDiario {

    private final DiarioRepository diario;
    private final int dias;

    public TareaDiario(DiarioRepository diario, @Value("${biblioteca.diario.dias:30}") int dias) {
        this.diario = diario;
        this.dias = dias;
    }

    @Scheduled(fixedDelayString = "${biblioteca.tareas.diario-ms:86400000}", initialDelay = 600000)
    public void revisar() {
        try {
            int borrados = diario.purgar(dias);
            if (borrados > 0) log.info("Diario del reproductor: {} evento(s) de hace mas de {} dias borrados", borrados, dias);
        } catch (RuntimeException e) {
            log.error("La purga del diario del reproductor fallo; se reintenta en la siguiente pasada", e);
        }
    }
}
