package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.service.IngestaService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * El buzon: lo que el humano deja en /datos/buzon/{carpeta}/ entra solo a la
 * biblioteca de ese usuario.
 *
 * QUIEN ES CADA CARPETA: los usuarios viven en auth_db, asi que la carpeta se
 * resuelve con la variable BUZON_USUARIOS ("correo:userId,correo:userId"); una
 * carpeta cuyo nombre es un numero se toma directamente como userId. Sin llamar
 * a auth-service: una tarea programada no tiene token de usuario.
 *
 * Lo importado pasa a {carpeta}/importados/ y lo rechazado a
 * {carpeta}/rechazados/ (si se quedara en el buzon se reintentaria cada
 * minuto). Se ignoran ficheros ocultos o a medio copiar y los modificados hace
 * menos de biblioteca.buzon-espera-ms (por defecto 30 s).
 */
@Slf4j
@Component
public class TareaBuzon {

    static final String IMPORTADOS = "importados";
    static final String RECHAZADOS = "rechazados";

    private final AlmacenDeArchivos almacen;
    private final IngestaService ingesta;
    private final Map<String, Long> usuarios;
    private final long esperaMs;

    public TareaBuzon(AlmacenDeArchivos almacen, IngestaService ingesta,
                      @Value("${biblioteca.buzon-usuarios:}") String mapa,
                      @Value("${biblioteca.buzon-espera-ms:30000}") long esperaMs) {
        this.almacen = almacen;
        this.ingesta = ingesta;
        this.usuarios = leerMapa(mapa);
        this.esperaMs = esperaMs;
    }

    static Map<String, Long> leerMapa(String mapa) {
        Map<String, Long> r = new HashMap<>();
        if (mapa == null || mapa.isBlank()) return r;
        for (String par : mapa.split(",")) {
            int dos = par.lastIndexOf(':');
            if (dos <= 0) {
                log.warn("BUZON_USUARIOS: entrada sin formato correo:userId ignorada: {}", par.trim());
                continue;
            }
            try {
                r.put(par.substring(0, dos).trim().toLowerCase(Locale.ROOT), Long.valueOf(par.substring(dos + 1).trim()));
            } catch (NumberFormatException e) {
                log.warn("BUZON_USUARIOS: userId no numerico en {}", par.trim());
            }
        }
        return r;
    }

    Long usuarioDe(String carpeta) {
        if (carpeta.matches("\\d{1,18}")) return Long.valueOf(carpeta);
        return usuarios.get(carpeta.toLowerCase(Locale.ROOT));
    }

    @Scheduled(fixedDelayString = "${biblioteca.tareas.buzon-ms:60000}", initialDelay = 30000)
    public void revisar() {
        Path buzon = almacen.buzon();
        if (!almacen.disponible() || !Files.isDirectory(buzon)) return;
        try (DirectoryStream<Path> carpetas = Files.newDirectoryStream(buzon, Files::isDirectory)) {
            for (Path carpeta : carpetas) {
                revisarCarpeta(carpeta);
            }
        } catch (IOException e) {
            log.error("No se pudo recorrer el buzon {}: {}", buzon, e.getMessage(), e);
        }
    }

    void revisarCarpeta(Path carpeta) throws IOException {
        String nombre = carpeta.getFileName().toString();
        Long usuario = usuarioDe(nombre);
        if (usuario == null) {
            log.warn("Buzon {}: no se sabe de quien es (anadelo a BUZON_USUARIOS)", nombre);
            return;
        }
        Instant limite = Instant.now().minusMillis(esperaMs);
        try (DirectoryStream<Path> ficheros = Files.newDirectoryStream(carpeta, Files::isRegularFile)) {
            for (Path f : ficheros) {
                if (seIgnora(f) || Files.getLastModifiedTime(f).toInstant().isAfter(limite)) continue;
                importar(usuario, carpeta, f);
            }
        }
    }

    static boolean seIgnora(Path f) {
        String n = f.getFileName().toString().toLowerCase(Locale.ROOT);
        return n.startsWith(".") || n.startsWith("~$") || n.endsWith(".part") || n.endsWith(".crdownload")
                || n.endsWith(".tmp");
    }

    private void importar(Long usuario, Path carpeta, Path f) {
        try {
            IngestaService.Resultado r;
            try (InputStream in = Files.newInputStream(f)) {
                r = ingesta.ingerir(usuario, f.getFileName().toString(), in, TipoEjemplar.LIBRO);
            }
            if (r.aceptado()) {
                log.info("Buzon: {} importado para el usuario {}", f.getFileName(), usuario);
                mover(f, carpeta.resolve(IMPORTADOS));
            } else {
                log.warn("Buzon: {} rechazado: {}", f.getFileName(), r.rechazo());
                mover(f, carpeta.resolve(RECHAZADOS));
            }
        } catch (IOException | RuntimeException e) {
            log.error("Buzon: fallo importando {}: {}", f, e.getMessage(), e);
        }
    }

    static void mover(Path f, Path destino) throws IOException {
        Files.createDirectories(destino);
        Path objetivo = destino.resolve(f.getFileName());
        if (Files.exists(objetivo)) {
            objetivo = destino.resolve(System.currentTimeMillis() + "-" + f.getFileName());
        }
        Files.move(f, objetivo, StandardCopyOption.REPLACE_EXISTING);
    }
}
