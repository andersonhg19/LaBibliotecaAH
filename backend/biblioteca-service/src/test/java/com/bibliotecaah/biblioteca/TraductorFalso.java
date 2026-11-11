package com.bibliotecaah.biblioteca;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Un LibreTranslate de mentira para las pruebas: servidor HTTP de verdad (el RestClient hace la
 * llamada completa, con su JSON y sus timeouts) que "traduce" anteponiendo "[es] ". Se puede
 * romper (500), devolver basura, o retener las respuestas hasta que la prueba lo suelte.
 */
public final class TraductorFalso {

    public enum Modo { BIEN, ERROR_500, BASURA }

    private static final ObjectMapper JSON = new ObjectMapper();

    private final HttpServer servidor;
    private final List<JsonNode> peticiones = new CopyOnWriteArrayList<>();
    private final List<JsonNode> detecciones = new CopyOnWriteArrayList<>();
    private volatile String idiomaDetectado = "en";
    private volatile double confianzaDetectada = 90.0;
    private volatile Modo modo = Modo.BIEN;
    private volatile CountDownLatch freno = new CountDownLatch(0);

    private TraductorFalso() {
        try {
            servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        servidor.createContext("/translate", this::atender);
        servidor.createContext("/detect", this::detectar);
        servidor.setExecutor(Executors.newCachedThreadPool());
        servidor.start();
    }

    public static TraductorFalso arrancar() {
        return new TraductorFalso();
    }

    public String url() {
        return "http://127.0.0.1:" + servidor.getAddress().getPort();
    }

    public void reiniciar() {
        modo = Modo.BIEN;
        freno.countDown();
        freno = new CountDownLatch(0);
        peticiones.clear();
        detecciones.clear();
        idiomaDetectado = "en";
        confianzaDetectada = 90.0;
    }

    /** Lo que respondera /detect a partir de ahora (por defecto en, 90). */
    public void detectara(String idioma, double confianza) {
        idiomaDetectado = idioma;
        confianzaDetectada = confianza;
    }

    /** Peticiones a /detect (aparte de las de /translate). */
    public List<JsonNode> detecciones() {
        return detecciones;
    }

    public void modo(Modo nuevo) {
        modo = nuevo;
    }

    /** A partir de ahora las respuestas esperan a {@link #soltar()}. */
    public void retener() {
        freno = new CountDownLatch(1);
    }

    public void soltar() {
        freno.countDown();
    }

    public List<JsonNode> peticiones() {
        return peticiones;
    }

    /** Cuantos textos se han mandado a traducir en total. */
    public int textosTraducidos() {
        return peticiones.stream().mapToInt(p -> p.get("q").size()).sum();
    }

    private void atender(HttpExchange intercambio) throws IOException {
        JsonNode peticion = JSON.readTree(intercambio.getRequestBody());
        peticiones.add(peticion);
        try {
            if (!freno.await(10, TimeUnit.SECONDS)) {
                responder(intercambio, 500, "{\"error\":\"freno sin soltar\"}");
                return;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        switch (modo) {
            case ERROR_500 -> responder(intercambio, 500, "{\"error\":\"modelo roto\"}");
            case BASURA -> responder(intercambio, 200, "{\"otra\":\"cosa\"}");
            default -> responder(intercambio, 200, JSON.writeValueAsString(traducir(peticion)));
        }
    }

    private void detectar(HttpExchange intercambio) throws IOException {
        detecciones.add(JSON.readTree(intercambio.getRequestBody()));
        if (modo == Modo.ERROR_500) {
            responder(intercambio, 500, "{\"error\":\"modelo roto\"}");
            return;
        }
        ArrayNode lista = JSON.createArrayNode();
        lista.addObject().put("confidence", confianzaDetectada).put("language", idiomaDetectado);
        responder(intercambio, 200, JSON.writeValueAsString(lista));
    }

    private static ObjectNode traducir(JsonNode peticion) {
        ObjectNode respuesta = JSON.createObjectNode();
        ArrayNode textos = respuesta.putArray("translatedText");
        ArrayNode detectados = JSON.createArrayNode();
        for (JsonNode q : peticion.get("q")) {
            textos.add("[" + peticion.get("target").asText() + "] " + q.asText());
            detectados.addObject().put("confidence", 90.0).put("language", "en");
        }
        if ("auto".equals(peticion.path("source").asText())) respuesta.set("detectedLanguage", detectados);
        return respuesta;
    }

    private static void responder(HttpExchange intercambio, int estado, String cuerpo) throws IOException {
        byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
        intercambio.getResponseHeaders().set("Content-Type", "application/json");
        intercambio.sendResponseHeaders(estado, bytes.length);
        try (OutputStream salida = intercambio.getResponseBody()) {
            salida.write(bytes);
        }
    }
}
