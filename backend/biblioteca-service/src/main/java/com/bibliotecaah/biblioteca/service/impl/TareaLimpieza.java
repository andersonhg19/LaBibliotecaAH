package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Recoge lo que queda huerfano cuando un archivo se borra mientras el taller
 * trabajaba con el (QA DA-14, DA-28) o cuando una subida se cae a mitad
 * (QA DA-13):
 *  · filas de bah_lib_audio y trabajos de un archivo que ya no existe (el
 *    taller hizo UPSERT despues del borrado);
 *  · carpetas originales/{id}, normalizados/{id} y audio/{id} sin fila en
 *    bah_lib_archivo.
 *
 * DE FORMA SEGURA: solo carpetas cuyo nombre es un UUID, que no esten en la
 * base y que lleven mas de {@code edadMinima} sin tocarse (una subida en curso
 * o una conversion recien empezada nunca cumplen las dos cosas). Si /datos no
 * esta montado no hace nada; si la base falla, la excepcion corta la pasada
 * antes de borrar nada.
 */
@Slf4j
@Component
public class TareaLimpieza {

    static final String[] ZONAS = {"originales", "normalizados", "audio"};

    private final JdbcTemplate jdbc;
    private final AlmacenDeArchivos almacen;
    private final Duration edadMinima;

    public TareaLimpieza(JdbcTemplate jdbc, AlmacenDeArchivos almacen,
                         @Value("${biblioteca.limpieza.edad-minima-horas:6}") long edadMinimaHoras) {
        this.jdbc = jdbc;
        this.almacen = almacen;
        this.edadMinima = Duration.ofHours(edadMinimaHoras);
    }

    @Scheduled(fixedDelayString = "${biblioteca.tareas.limpieza-ms:3600000}", initialDelay = 120000)
    public void revisar() {
        try {
            limpiar();
        } catch (RuntimeException e) {
            log.error("La limpieza de restos fallo; se reintenta en la siguiente pasada", e);
        }
    }

    /** @return cuantas cosas borro (filas + carpetas) */
    public int limpiar() {
        int filas = jdbc.update("DELETE FROM bah_lib_audio au WHERE NOT EXISTS "
                + "(SELECT 1 FROM bah_lib_archivo a WHERE a.id = au.archivo_id)");
        filas += jdbc.update("DELETE FROM bah_lib_trabajo t WHERE NOT EXISTS "
                + "(SELECT 1 FROM bah_lib_archivo a WHERE a.id = t.archivo_id)");
        int carpetas = 0;
        if (almacen.disponible()) {
            Instant limite = Instant.now().minus(edadMinima);
            for (String zona : ZONAS) {
                carpetas += limpiarZona(almacen.raiz().resolve(zona), limite);
            }
        }
        if (filas + carpetas > 0) {
            log.info("Limpieza de restos: {} fila(s) y {} carpeta(s) huerfanas borradas", filas, carpetas);
        }
        return filas + carpetas;
    }

    private int limpiarZona(Path zona, Instant limite) {
        if (!Files.isDirectory(zona)) return 0;
        int borradas = 0;
        try (DirectoryStream<Path> carpetas = Files.newDirectoryStream(zona, Files::isDirectory)) {
            for (Path carpeta : carpetas) {
                UUID id = uuid(carpeta.getFileName().toString());
                if (id == null || existe(id) || reciente(carpeta, limite)) continue;
                AlmacenDeArchivos.borrarArbol(carpeta);
                log.info("Carpeta huerfana borrada: {}", carpeta);
                borradas++;
            }
        } catch (IOException e) {
            log.warn("No se pudo recorrer {}: {}", zona, e.getMessage());
        }
        return borradas;
    }

    private boolean existe(UUID id) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo WHERE id = ?", Integer.class, id);
        return n != null && n > 0;
    }

    static boolean reciente(Path carpeta, Instant limite) {
        try {
            return Files.getLastModifiedTime(carpeta).toInstant().isAfter(limite);
        } catch (IOException e) {
            return true;
        }
    }

    static UUID uuid(String nombre) {
        try {
            UUID id = UUID.fromString(nombre);
            return id.toString().equalsIgnoreCase(nombre) ? id : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
