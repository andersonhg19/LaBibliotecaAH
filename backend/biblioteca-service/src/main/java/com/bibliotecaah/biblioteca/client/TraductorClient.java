package com.bibliotecaah.biblioteca.client;

import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Llamadas al traductor autoalojado (servicio propio Opus-MT con API compatible con LibreTranslate, contratos v1.3.1): {@code POST /translate}
 * con {@code q} como lista para traducir un lote de frases en una sola llamada.
 *
 * No propaga el JWT ni ningun dato del usuario: el traductor solo recibe el texto. Cualquier
 * fallo (no responde, timeout, 4xx/5xx, respuesta rara) se convierte en
 * {@code traductorNoDisponible} con errorCode 503 y queda en el log; nunca tumba la peticion
 * con un 103.
 */
@Slf4j
@Component
public class TraductorClient {

    /** Resultado de un lote: una traduccion por texto, en el mismo orden, y el idioma detectado (o null). */
    public record Lote(List<String> traducciones, String origenDetectado) { }

    private final RestClient cliente;

    public TraductorClient(@Qualifier("clienteDelTraductor") RestClient cliente) {
        this.cliente = cliente;
    }

    public Lote traducir(List<String> textos, String origen, String destino) {
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("q", textos);
        cuerpo.put("source", origen);
        cuerpo.put("target", destino);
        cuerpo.put("format", "text");
        JsonNode respuesta;
        try {
            respuesta = cliente.post().uri("/translate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(cuerpo)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            log.error("El traductor no respondio ({} textos, {} -> {}): {}", textos.size(), origen, destino,
                    e.getMessage());
            throw noDisponible();
        }
        JsonNode traducido = respuesta == null ? null : respuesta.get("translatedText");
        if (traducido == null || !traducido.isArray() || traducido.size() != textos.size()) {
            log.error("Respuesta inesperada del traductor para {} textos: {}", textos.size(), respuesta);
            throw noDisponible();
        }
        List<String> traducciones = new ArrayList<>(textos.size());
        traducido.forEach(t -> traducciones.add(t.asText()));
        return new Lote(traducciones, detectado(respuesta.get("detectedLanguage")));
    }

    /** Idioma detectado de un texto y su confianza (0-100, como LibreTranslate). */
    public record Deteccion(String idioma, double confianza) { }

    /**
     * Idioma de {@code texto} segun el traductor ({@code POST /detect}). QA NU-02: sirve para no responder
     * "ya esta en el idioma de destino" fiandose de un idioma del libro que puede ser inventado.
     * Devuelve null si el traductor no sabe decirlo o no responde: la deteccion es una ayuda y su fallo no
     * debe impedir traducir (si el traductor esta caido, la traduccion fallara despues con su propio error).
     */
    public Deteccion detectar(String texto) {
        JsonNode respuesta;
        try {
            respuesta = cliente.post().uri("/detect")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("q", texto))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            log.warn("El traductor no respondio a /detect ({} caracteres): {}", texto.length(), e.getMessage());
            return null;
        }
        JsonNode primero = respuesta != null && respuesta.isArray() && !respuesta.isEmpty() ? respuesta.get(0) : null;
        String idioma = primero == null ? "" : primero.path("language").asText("");
        if (idioma.isBlank()) return null;
        return new Deteccion(idioma, primero.path("confidence").asDouble(0));
    }

    /** Con origen "auto" llega un objeto o (en lotes) una lista; se toma el primero con idioma. */
    private static String detectado(JsonNode nodo) {
        if (nodo == null || nodo.isNull()) return null;
        if (nodo.isArray()) {
            for (JsonNode n : nodo) {
                String idioma = detectado(n);
                if (idioma != null) return idioma;
            }
            return null;
        }
        String idioma = nodo.path("language").asText("");
        return idioma.isBlank() ? null : idioma;
    }

    private static ValidationException noDisponible() {
        return new ValidationException(Message.Msj.traductorNoDisponible, CodigoError.SERVICIO_NO_DISPONIBLE);
    }
}
