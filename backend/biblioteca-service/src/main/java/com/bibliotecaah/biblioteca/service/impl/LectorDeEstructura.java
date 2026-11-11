package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.CapituloDTO;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Lee normalizados/{archivoId}/estructura.json (contratos.md §4) y devuelve los
 * capitulos con sus minutos a 1x (palabras / 150, redondeado hacia arriba).
 * Si el fichero no esta (aun sin convertir, disco desconectado) devuelve una
 * lista vacia y deja log: la ficha del libro se sigue viendo.
 */
@Slf4j
@Component
public class LectorDeEstructura {

    static final double PALABRAS_POR_MINUTO = 150.0;

    private final AlmacenDeArchivos almacen;
    private final ObjectMapper json;

    public LectorDeEstructura(AlmacenDeArchivos almacen, ObjectMapper json) {
        this.almacen = almacen;
        this.json = json;
    }

    public List<CapituloDTO> capitulos(UUID archivoId) {
        List<CapituloDTO> lista = new ArrayList<>();
        if (archivoId == null || !almacen.disponible()) return lista;
        Path ruta = almacen.normalizado(archivoId, "estructura.json");
        if (!Files.isRegularFile(ruta)) return lista;
        try {
            JsonNode capitulos = json.readTree(ruta.toFile()).path("capitulos");
            for (JsonNode c : capitulos) {
                int palabras = c.path("palabras").asInt(0);
                lista.add(new CapituloDTO(c.path("indice").asInt(lista.size()),
                        c.path("titulo").asText(""),
                        (int) Math.ceil(palabras / PALABRAS_POR_MINUTO)));
            }
        } catch (IOException e) {
            log.warn("No se pudo leer {}: {}", ruta, e.getMessage());
        }
        return lista;
    }
}
