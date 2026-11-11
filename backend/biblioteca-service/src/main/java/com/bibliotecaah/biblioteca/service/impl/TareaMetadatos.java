package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Obra;
import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import com.bibliotecaah.biblioteca.repository.ArchivoRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * Cuando el taller deja un archivo LISTO, copia sus metadatos (titulo, autores,
 * anio, editorial, isbn, idioma, sinopsis) a las obras que aun tienen datos
 * provisionales del nombre del fichero (fuente NOMBRE_ARCHIVO) y las pasa a
 * fuente ARCHIVO. Lo corregido a mano (MANUAL) no se toca.
 */
@Slf4j
@Component
public class TareaMetadatos {

    private final ArchivoRepository archivos;
    private final EjemplarRepository ejemplares;
    private final TrabajoRepository trabajos;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public TareaMetadatos(ArchivoRepository archivos, EjemplarRepository ejemplares, TrabajoRepository trabajos,
                          ObjectMapper json, TransactionTemplate tx) {
        this.archivos = archivos;
        this.ejemplares = ejemplares;
        this.trabajos = trabajos;
        this.json = json;
        this.tx = tx;
    }

    @Scheduled(fixedDelayString = "${biblioteca.tareas.metadatos-ms:10000}", initialDelay = 15000)
    public void revisar() {
        for (Archivo a : archivos.findByEstadoConversionAndMetadatosAplicadosFalse(Archivo.LISTO)) {
            try {
                tx.executeWithoutResult(s -> aplicarArchivo(a));
            } catch (RuntimeException e) {
                /* Un archivo con metadatos raros no puede frenar a los demas. */
                log.error("No se pudieron aplicar los metadatos del archivo {}: {}", a.getId(), e.getMessage(), e);
            }
        }
    }

    void aplicarArchivo(Archivo a) {
        String metadatos = trabajos.metadatosDe(a.getId());
        int n = 0;
        for (Ejemplar e : ejemplares.conObraProvisional(a.getId(), FuenteMetadatos.NOMBRE_ARCHIVO)) {
            if (aplicar(e.getObra(), metadatos)) n++;
        }
        Archivo vivo = archivos.findById(a.getId()).orElse(a);
        vivo.setMetadatosAplicados(true);
        archivos.save(vivo);
        log.info("Metadatos del archivo {} aplicados a {} obra(s)", a.getId(), n);
    }

    /** Copia los metadatos a la obra. Devuelve si habia algo que copiar. */
    public boolean aplicar(Obra obra, String metadatosJson) {
        if (metadatosJson == null || metadatosJson.isBlank()) return false;
        JsonNode m;
        try {
            m = json.readTree(metadatosJson);
        } catch (JsonProcessingException ex) {
            log.warn("Metadatos ilegibles para la obra {}: {}", obra.getId(), ex.getOriginalMessage());
            return false;
        }
        if (!m.isObject()) return false;

        String titulo = texto(m, "titulo");
        if (titulo != null) obra.setTitulo(recortar(titulo, 500));
        List<String> autores = lista(m.get("autores"));
        if (!autores.isEmpty()) obra.setAutores(autores);
        Integer anio = entero(m.get("anio"));
        if (anio != null) obra.setAnio(anio);
        String editorial = texto(m, "editorial");
        if (editorial != null) obra.setEditorial(recortar(editorial, 300));
        String isbn = texto(m, "isbn");
        if (isbn != null) obra.setIsbn(recortar(isbn, 20));
        String idioma = texto(m, "idioma");
        if (idioma != null) obra.setIdioma(recortar(idioma, 20));
        String sinopsis = texto(m, "sinopsis");
        if (sinopsis != null) obra.setSinopsis(sinopsis);
        obra.setFuenteMetadatos(FuenteMetadatos.ARCHIVO);
        return true;
    }

    private static String texto(JsonNode m, String campo) {
        JsonNode v = m.get(campo);
        if (v == null || v.isNull()) return null;
        String s = v.asText().trim();
        return s.isEmpty() ? null : s;
    }

    private static List<String> lista(JsonNode v) {
        List<String> r = new ArrayList<>();
        if (v != null && v.isArray()) {
            v.forEach(x -> {
                String s = x.asText().trim();
                if (!s.isEmpty() && !r.contains(s)) r.add(s);
            });
        }
        return r;
    }

    private static Integer entero(JsonNode v) {
        if (v == null || v.isNull()) return null;
        String s = v.asText().trim();
        return s.matches("\\d{1,4}") ? Integer.valueOf(s) : null;
    }

    private static String recortar(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
