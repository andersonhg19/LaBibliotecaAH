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
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Lee normalizados/{archivoId}/estructura.json (contratos.md §4) y devuelve los
 * capitulos con sus minutos a 1x (palabras / 150, redondeado hacia arriba).
 * Si el fichero no esta (aun sin convertir, disco desconectado) devuelve una
 * lista vacia y deja log: la ficha del libro se sigue viendo.
 *
 * (0.4.0, contrato C1) Entiende la estructura v2 ({"version": 2}, con tipo,
 * region, numero, enVoz y palabrasVoz por capitulo) y sigue leyendo la v1 tal
 * cual: en un libro v1 todos los capitulos van en voz y los campos nuevos
 * llegan null. Lo que no encaja (region desconocida, numero que no es entero)
 * se ignora en vez de romper la ficha.
 */
@Slf4j
@Component
public class LectorDeEstructura {

    static final double PALABRAS_POR_MINUTO = 150.0;
    /** Sin estructura.json (hojas de calculo, aun sin convertir o disco fuera). */
    public static final int SIN_ESTRUCTURA = -1;
    static final String CUERPO = "cuerpo";
    private static final Set<String> REGIONES = Set.of("antes", CUERPO, "despues");
    private static final Pattern TIPO_VALIDO = Pattern.compile("^[a-z_]{1,30}$");

    private final AlmacenDeArchivos almacen;
    private final ObjectMapper json;

    public LectorDeEstructura(AlmacenDeArchivos almacen, ObjectMapper json) {
        this.almacen = almacen;
        this.json = json;
    }

    public List<CapituloDTO> capitulos(UUID archivoId) {
        List<CapituloDTO> lista = new ArrayList<>();
        JsonNode raiz = leer(archivoId);
        if (raiz == null) return lista;
        for (JsonNode c : raiz.path("capitulos")) {
            lista.add(capitulo(c, lista.size()));
        }
        return lista;
    }

    /**
     * Version del formato de la estructura: el campo "version" (v2) o, si no
     * esta, "versionFormato" (v1); 1 si no dice nada; {@link #SIN_ESTRUCTURA}
     * si no hay fichero legible.
     */
    public int version(UUID archivoId) {
        JsonNode raiz = leer(archivoId);
        if (raiz == null) return SIN_ESTRUCTURA;
        if (raiz.path("version").canConvertToInt()) return raiz.path("version").asInt();
        if (raiz.path("versionFormato").canConvertToInt()) return raiz.path("versionFormato").asInt();
        return 1;
    }

    private JsonNode leer(UUID archivoId) {
        if (archivoId == null || !almacen.disponible()) return null;
        Path ruta = almacen.normalizado(archivoId, "estructura.json");
        if (!Files.isRegularFile(ruta)) return null;
        try {
            JsonNode raiz = json.readTree(ruta.toFile());
            return raiz != null && raiz.isObject() ? raiz : null;
        } catch (IOException e) {
            log.warn("No se pudo leer {}: {}", ruta, e.getMessage());
            return null;
        }
    }

    static CapituloDTO capitulo(JsonNode c, int posicion) {
        int palabras = c.path("palabras").asInt(0);
        String region = texto(c, "region");
        if (region != null && !REGIONES.contains(region)) region = null;
        String tipo = texto(c, "tipo");
        if (tipo != null && !TIPO_VALIDO.matcher(tipo).matches()) tipo = null;
        Integer numero = c.path("numero").isIntegralNumber() ? Integer.valueOf(c.path("numero").asInt()) : null;
        Integer minutosVoz = c.path("palabrasVoz").isIntegralNumber()
                ? Integer.valueOf(minutos(Math.max(0, c.path("palabrasVoz").asInt()))) : null;
        boolean porDefecto = c.path("enVoz").isBoolean()
                ? c.path("enVoz").asBoolean()
                : region == null || CUERPO.equals(region);
        return CapituloDTO.builder()
                .indice(c.path("indice").asInt(posicion))
                .titulo(c.path("titulo").asText(""))
                .minutos(minutos(palabras))
                .tipo(tipo)
                .region(region)
                .numero(numero)
                .enVozPorDefecto(porDefecto)
                .enVoz(porDefecto)
                .minutosVoz(minutosVoz)
                .build();
    }

    private static int minutos(int palabras) {
        return (int) Math.ceil(palabras / PALABRAS_POR_MINUTO);
    }

    private static String texto(JsonNode c, String campo) {
        JsonNode v = c.get(campo);
        return v != null && v.isTextual() && !v.asText().isBlank() ? v.asText().trim() : null;
    }
}
