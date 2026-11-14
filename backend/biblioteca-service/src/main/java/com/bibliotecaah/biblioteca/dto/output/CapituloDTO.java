package com.bibliotecaah.biblioteca.dto.output;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;

/**
 * Un capitulo de la ficha (contratos §9 y, desde 0.4.0, C3). Los campos de la
 * estructura v2 (tipo, region, numero, minutosVoz) NO van en el JSON de los
 * libros convertidos antes y aun sin reclasificar (v1): la web, al no verlos,
 * numera como siempre (validacion 0.4.0, C12: antes llegaban como null y la web
 * creia que era un v2 sin numeros). En un libro v2 "numero" va siempre, aunque
 * sea null (= sin numero); tipo, region y minutosVoz solo si se conocen.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CapituloDTO {
    private int indice;
    private String titulo;
    /** ceil(palabras / 150), como siempre. */
    private int minutos;
    /** capitulo | parte | prologo | ... (estructura v2) o null. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String tipo;
    /** antes | cuerpo | despues (estructura v2) o null. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String region;
    /** Numero visible calculado por el taller; null = sin numero (o libro v1). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Integer numero;
    /** Lo que vale de verdad: la preferencia del usuario si la hay; si no, enVozPorDefecto. */
    @Builder.Default
    private boolean enVoz = true;
    /** estructura.enVoz, o true si el libro es v1. */
    @Builder.Default
    private boolean enVozPorDefecto = true;
    /** ceil(palabrasVoz / 150) si la estructura lo trae; si no, null. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Integer minutosVoz;

    /** El libro trae la estructura v2 (clasificada por el taller). No va en el JSON. */
    @JsonIgnore
    @Builder.Default
    private boolean clasificado = false;

    /** Capitulo de un libro v1 (sin clasificar): en voz por defecto. */
    public CapituloDTO(int indice, String titulo, int minutos) {
        this(indice, titulo, minutos, null, null, null, true, true, null, false);
    }

    /** C12: en un libro v2 un capitulo sin numero lleva {@code "numero": null}; en un v1 no lleva el campo. */
    @JsonAnyGetter
    public Map<String, Object> numeroNuloDeUnV2() {
        Map<String, Object> extra = new HashMap<>();
        if (clasificado && numero == null) extra.put("numero", null);
        return extra;
    }
}
