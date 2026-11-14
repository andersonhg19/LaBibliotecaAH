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
        boolean clasificado = version(raiz) >= 2;
        for (JsonNode c : raiz.path("capitulos")) {
            CapituloDTO capitulo = capitulo(c, lista.size());
            capitulo.setClasificado(clasificado);
            lista.add(capitulo);
        }
        nuncaTodoFueraDeLaVoz(lista, archivoId);
        return lista;
    }

    /**
     * Validacion 0.4.0 (A-1): la primera regla del taller dejo libros sin NINGUN
     * capitulo en voz (un solo cuento titulado "Epigrafe", unas "Notas" sueltas,
     * cuentos cortos antes de uno largo...): escuchar de corrido no tenia nada que
     * leer y preparar el libro daba total 0. Si ningun capitulo va en voz por
     * defecto, van todos (como un libro v1). Las preferencias del usuario siguen
     * mandando sobre este defecto.
     */
    static void nuncaTodoFueraDeLaVoz(List<CapituloDTO> lista, UUID archivoId) {
        if (lista.isEmpty() || lista.stream().anyMatch(CapituloDTO::isEnVozPorDefecto)) return;
        log.debug("Estructura de {} sin ningun capitulo en voz: van todos por defecto", archivoId);
        for (CapituloDTO c : lista) {
            c.setEnVozPorDefecto(true);
            c.setEnVoz(true);
        }
    }

    /**
     * Version del formato de la estructura: el campo "version" (v2) o, si no
     * esta, "versionFormato" (v1); 1 si no dice nada; {@link #SIN_ESTRUCTURA}
     * si no hay fichero legible.
     */
    public int version(UUID archivoId) {
        JsonNode raiz = leer(archivoId);
        return raiz == null ? SIN_ESTRUCTURA : version(raiz);
    }

    /**
     * Version y version del clasificador de una estructura de un vistazo (una sola
     * lectura del fichero): {@code version} como {@link #version(UUID)} y
     * {@code clasificador} = el entero "clasificador" de la raiz (lo escribe el
     * taller desde la regla corregida); 1 si no esta (v2 de la primera regla).
     */
    public record Versiones(int version, int clasificador) { }

    public Versiones versiones(UUID archivoId) {
        JsonNode raiz = leer(archivoId);
        if (raiz == null) return new Versiones(SIN_ESTRUCTURA, 0);
        int clasificador = raiz.path("clasificador").isIntegralNumber() ? raiz.path("clasificador").asInt() : 1;
        return new Versiones(version(raiz), clasificador);
    }

    private static int version(JsonNode raiz) {
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
