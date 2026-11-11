package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.client.TraductorClient;
import com.bibliotecaah.biblioteca.dto.output.CapituloTraducidoDTO;
import com.bibliotecaah.biblioteca.dto.output.FraseTraducidaDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntConsumer;

/**
 * Traduccion de capitulos enteros (contratos v1.3, POST /v1/traducir/capitulo).
 *
 * Lee normalizados/{archivoId}/frases/cap-NNN.json, traduce el texto VISUAL de cada frase por
 * lotes (una llamada al traductor por lote, frases repetidas una sola vez) respetando sus ids, y
 * guarda el resultado en normalizados/{archivoId}/traducciones/{destino}/cap-NNN.json: compartido
 * por todos los ejemplares de ese archivo (el texto es el mismo) y borrado con el archivo.
 *
 * El fichero guardado lleva el sha256 de frases/cap-NNN.json: si el taller reconvierte el libro y
 * las frases cambian, la traduccion vieja deja de valer sola y se rehace.
 *
 * POR QUE AQUI Y NO EN EL TALLER: el traductor es un servicio HTTP como cualquier otro y el
 * cliente con timeouts ya vive en Java; el taller esta ocupado con la voz (CPU/GPU) y meter un
 * tipo nuevo en bah_lib_trabajo obligaria a cambiar su codigo Python, su cola y su puerta de
 * calidad sin ganar nada. Lo que se pierde (el trabajo en curso si biblioteca-service se
 * reinicia) se recupera solo: el estado sale de los ficheros y la siguiente consulta lo relanza.
 *
 * Capitulos cortos (hasta {@code sincronoMax} caracteres) se traducen en la misma peticion y
 * vuelven LISTO; los largos van a un ejecutor acotado y vuelven PENDIENTE con su progreso.
 */
@Slf4j
@Component
public class TraductorDeCapitulos {

    static final String LISTO = "LISTO";
    static final String PENDIENTE = "PENDIENTE";
    static final String ERROR = "ERROR";
    static final int VERSION_FORMATO = 1;
    static final String AUTO = "auto";
    /** Caracteres del capitulo que se mandan a /detect y confianza minima para creerselo (QA NU-02). */
    static final int MUESTRA_DETECCION = 2000;
    static final double CONFIANZA_MINIMA = 60.0;

    /** Un capitulo traduciendose (o que acaba de fallar). */
    static final class EnCurso {
        final int total;
        final AtomicInteger hechas = new AtomicInteger();
        volatile String error;
        volatile Instant errorHasta;

        EnCurso(int total) {
            this.total = total;
        }

        int progreso() {
            return total == 0 ? 0 : Math.min(99, hechas.get() * 100 / total);
        }
    }

    private record Frase(String id, String texto) { }

    private final AlmacenDeArchivos almacen;
    private final TraductorClient traductor;
    private final ObjectMapper json;
    private final Mensajes mensajes;
    private final TaskExecutor ejecutor;
    private final Clock reloj;
    private final int sincronoMax;
    private final int loteFrases;
    private final int loteCaracteres;
    private final long errorSegundos;

    private final Map<String, EnCurso> enCurso = new ConcurrentHashMap<>();

    @Autowired
    public TraductorDeCapitulos(AlmacenDeArchivos almacen, TraductorClient traductor, ObjectMapper json,
                                Mensajes mensajes,
                                @Qualifier("ejecutorDeTraducciones") TaskExecutor ejecutor,
                                @Value("${biblioteca.traductor.capitulo-sincrono-max-caracteres:1500}") int sincronoMax,
                                @Value("${biblioteca.traductor.lote-frases:40}") int loteFrases,
                                @Value("${biblioteca.traductor.lote-caracteres:4000}") int loteCaracteres,
                                @Value("${biblioteca.traductor.error-segundos:60}") long errorSegundos) {
        this(almacen, traductor, json, mensajes, ejecutor, Clock.systemUTC(), sincronoMax, loteFrases,
                loteCaracteres, errorSegundos);
    }

    TraductorDeCapitulos(AlmacenDeArchivos almacen, TraductorClient traductor, ObjectMapper json, Mensajes mensajes,
                         TaskExecutor ejecutor, Clock reloj, int sincronoMax, int loteFrases, int loteCaracteres,
                         long errorSegundos) {
        this.almacen = almacen;
        this.traductor = traductor;
        this.json = json;
        this.mensajes = mensajes;
        this.ejecutor = ejecutor;
        this.reloj = reloj;
        this.sincronoMax = sincronoMax;
        this.loteFrases = Math.max(1, loteFrases);
        this.loteCaracteres = Math.max(1, loteCaracteres);
        this.errorSegundos = errorSegundos;
    }

    /**
     * Estado del capitulo traducido; si falta lo traduce (corto) o lo lanza (largo).
     *
     * @param origen        idioma de origen, o "auto" si el del libro no es fiable (desconocido o igual al
     *                      destino): entonces, antes de traducir, se detecta el idioma del propio capitulo y
     *                      solo si es el de destino se responde 120 mismoIdioma (QA NU-02).
     * @param antesDeLanzar se llama SOLO cuando hay que traducir de verdad (no si ya esta LISTO o
     *                      en curso): ahi se aplica el limite por usuario.
     */
    public CapituloTraducidoDTO consultar(UUID archivoId, int capitulo, String origen, String destino,
                                          boolean reintentar, Runnable antesDeLanzar) {
        almacen.exigirDisponible();
        Path rutaFrases = almacen.frases(archivoId, capitulo);
        if (!Files.isRegularFile(rutaFrases)) {
            throw new ValidationException(Message.Msj.capituloSinTexto, CodigoError.NO_ENCONTRADO);
        }
        byte[] fuente = leer(rutaFrases);
        String huella = sha256(fuente);
        Path rutaTraduccion = almacen.traduccion(archivoId, destino, capitulo);

        List<FraseTraducidaDTO> guardadas = guardada(rutaTraduccion, huella);
        if (guardadas != null) return listo(guardadas);

        String clave = archivoId + "/" + destino + "/" + capitulo;
        EnCurso actual = enCurso.get(clave);
        if (actual != null && actual.error == null) return pendiente(actual.progreso());
        if (actual != null) {
            if (!reintentar && reloj.instant().isBefore(actual.errorHasta)) {
                return CapituloTraducidoDTO.builder().estado(ERROR).error(actual.error).build();
            }
            enCurso.remove(clave, actual);
        }

        List<Frase> frases = frases(fuente, rutaFrases);
        int caracteres = frases.stream().mapToInt(f -> f.texto().length()).sum();
        if (AUTO.equals(origen)) exigirOtroIdioma(frases, destino);
        antesDeLanzar.run();

        if (caracteres <= sincronoMax) {
            List<FraseTraducidaDTO> traducidas = traducir(frases, origen, destino, hechas -> { });
            escribir(rutaTraduccion, capitulo, origen, destino, huella, traducidas);
            return listo(traducidas);
        }

        EnCurso nuevo = new EnCurso(distintos(frases));
        if (enCurso.putIfAbsent(clave, nuevo) != null) return pendiente(0);
        try {
            ejecutor.execute(() -> trabajar(clave, nuevo, frases, rutaTraduccion, capitulo, origen, destino, huella));
        } catch (RejectedExecutionException lleno) {
            enCurso.remove(clave, nuevo);
            log.warn("Cola de traducciones llena: no se lanza {}", clave);
            throw new ValidationException(Message.Msj.traductorOcupado, CodigoError.DEMASIADAS_PETICIONES);
        }
        log.info("Traduccion de {} lanzada en segundo plano ({} frases, {} caracteres)", clave, frases.size(),
                caracteres);
        return pendiente(0);
    }

    private void trabajar(String clave, EnCurso estado, List<Frase> frases, Path ruta, int capitulo, String origen,
                          String destino, String huella) {
        long inicio = System.nanoTime();
        try {
            List<FraseTraducidaDTO> traducidas = traducir(frases, origen, destino, estado.hechas::addAndGet);
            escribir(ruta, capitulo, origen, destino, huella, traducidas);
            enCurso.remove(clave, estado);
            log.info("Traduccion de {} lista en {} ms", clave, (System.nanoTime() - inicio) / 1_000_000);
        } catch (ValidationException e) {
            fallo(clave, estado, mensajes.texto(e.getClave(), e.getArgumentos()), null);
        } catch (RuntimeException e) {
            fallo(clave, estado, mensajes.texto(Message.Msj.errorInesperado), e);
        }
    }

    private void fallo(String clave, EnCurso estado, String motivo, RuntimeException causa) {
        if (causa != null) log.error("La traduccion de {} fallo", clave, causa);
        else log.warn("La traduccion de {} fallo: {}", clave, motivo);
        estado.errorHasta = reloj.instant().plusSeconds(errorSegundos);
        estado.error = mensajes.texto(Message.Msj.traduccionFallida, motivo);
    }

    /**
     * Traduce manteniendo el orden y los ids. Las frases vacias no se envian; las repetidas
     * (titulos, "—Si.", separadores) se envian una vez.
     */
    private List<FraseTraducidaDTO> traducir(List<Frase> frases, String origen, String destino, IntConsumer avance) {
        Map<String, String> traduccion = new LinkedHashMap<>();
        for (Frase f : frases) {
            if (!f.texto().isBlank()) traduccion.put(f.texto(), null);
        }
        List<String> pendientes = new ArrayList<>(traduccion.keySet());
        int i = 0;
        while (i < pendientes.size()) {
            List<String> lote = new ArrayList<>();
            int caracteres = 0;
            while (i < pendientes.size() && lote.size() < loteFrases
                    && (lote.isEmpty() || caracteres + pendientes.get(i).length() <= loteCaracteres)) {
                caracteres += pendientes.get(i).length();
                lote.add(pendientes.get(i++));
            }
            List<String> resultado = traductor.traducir(lote, origen, destino).traducciones();
            for (int k = 0; k < lote.size(); k++) traduccion.put(lote.get(k), resultado.get(k));
            avance.accept(lote.size());
        }
        return frases.stream()
                .map(f -> new FraseTraducidaDTO(f.id(), f.texto().isBlank() ? f.texto() : traduccion.get(f.texto())))
                .toList();
    }

    /** 120 mismoIdioma solo si el texto del capitulo, detectado por el traductor, ya esta en el destino. */
    private void exigirOtroIdioma(List<Frase> frases, String destino) {
        StringBuilder muestra = new StringBuilder();
        for (Frase f : frases) {
            if (muestra.length() >= MUESTRA_DETECCION) break;
            if (!f.texto().isBlank()) muestra.append(f.texto()).append('\n');
        }
        if (muestra.isEmpty()) return;
        TraductorClient.Deteccion d = traductor.detectar(muestra.substring(0, Math.min(muestra.length(),
                MUESTRA_DETECCION)));
        if (d != null && destino.equals(d.idioma()) && d.confianza() >= CONFIANZA_MINIMA) {
            throw new ValidationException(Message.Msj.mismoIdioma, CodigoError.DATO_INVALIDO, destino);
        }
    }

    private static int distintos(List<Frase> frases) {
        return (int) frases.stream().map(Frase::texto).filter(t -> !t.isBlank()).distinct().count();
    }

    // ------------------------------------------------------------------ ficheros

    /** La traduccion guardada si existe y corresponde a estas frases; null si no. */
    private List<FraseTraducidaDTO> guardada(Path ruta, String huella) {
        if (!Files.isRegularFile(ruta)) return null;
        try {
            JsonNode raiz = json.readTree(ruta.toFile());
            if (!huella.equals(raiz.path("fuenteSha256").asText())) {
                log.info("La traduccion {} es de otra version del texto: se rehace", ruta);
                return null;
            }
            List<FraseTraducidaDTO> frases = new ArrayList<>();
            for (JsonNode f : raiz.path("frases")) {
                frases.add(new FraseTraducidaDTO(f.path("id").asText(), f.path("texto").asText("")));
            }
            return frases;
        } catch (IOException e) {
            log.warn("Traduccion guardada ilegible {} ({}): se rehace", ruta, e.getMessage());
            return null;
        }
    }

    private List<Frase> frases(byte[] fuente, Path ruta) {
        try {
            List<Frase> frases = new ArrayList<>();
            for (JsonNode f : json.readTree(fuente).path("frases")) {
                frases.add(new Frase(f.path("id").asText(), f.path("texto").asText("")));
            }
            return frases;
        } catch (IOException e) {
            throw new UncheckedIOException("frases ilegibles: " + ruta, e);
        }
    }

    private void escribir(Path ruta, int capitulo, String origen, String destino, String huella,
                          List<FraseTraducidaDTO> frases) {
        ObjectNode raiz = json.createObjectNode();
        raiz.put("versionFormato", VERSION_FORMATO);
        raiz.put("capitulo", capitulo);
        raiz.put("origen", origen);
        raiz.put("destino", destino);
        raiz.put("fuenteSha256", huella);
        raiz.put("motor", "opus-mt");
        ArrayNode lista = raiz.putArray("frases");
        for (FraseTraducidaDTO f : frases) lista.addObject().put("id", f.getId()).put("texto", f.getTexto());
        try {
            Files.createDirectories(ruta.getParent());
            Path tmp = Files.createTempFile(ruta.getParent(), "cap-", ".part");
            json.writeValue(tmp.toFile(), raiz);
            try {
                Files.move(tmp, ruta, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException sinAtomico) {
                Files.move(tmp, ruta, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("no se pudo guardar la traduccion " + ruta, e);
        }
    }

    private static byte[] leer(Path ruta) {
        try {
            return Files.readAllBytes(ruta);
        } catch (IOException e) {
            throw new UncheckedIOException("no se pudo leer " + ruta, e);
        }
    }

    static String sha256(byte[] datos) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(datos));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    private static CapituloTraducidoDTO listo(List<FraseTraducidaDTO> frases) {
        return CapituloTraducidoDTO.builder().estado(LISTO).frases(frases).progreso(100).build();
    }

    private static CapituloTraducidoDTO pendiente(int progreso) {
        return CapituloTraducidoDTO.builder().estado(PENDIENTE).progreso(progreso).build();
    }
}
