package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;
import com.bibliotecaah.biblioteca.dto.output.PronunciacionDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.PronunciacionRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.PronunciacionService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * (B17) Diccionario de pronunciacion por libro. Ver {@link PronunciacionService}.
 *
 * Al guardar: (1) los trabajos de voz PENDIENTES del archivo pasan a llevar el
 * diccionario nuevo; (2) de los capitulos con audio LISTO (o generandose ahora
 * con el diccionario viejo) se regeneran los que contienen alguna palabra que
 * cambio (anadida, quitada o con otra pronunciacion), mirando el texto que lee
 * la voz en normalizados/{archivo}/frases/cap-NNN.json; si ese texto no se puede
 * leer, se regenera por si acaso. El taller rehace el audio sin tocar el estado
 * LISTO (el viejo sigue sonando) y lo sustituye de forma atomica al terminar.
 */
@Slf4j
@Service
public class PronunciacionServiceImpl implements PronunciacionService {

    /** Letras (no solo signos): una "palabra" sin ninguna no tiene que pronunciarse. */
    private static final Pattern CON_LETRA = Pattern.compile("[\\p{L}\\p{N}]");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cc}\\p{Cf}\\u2028\\u2029]");
    /** Marcas que la voz leeria en voz alta (validacion r3, R3-1): no hay inyeccion, pero suenan a basura. */
    private static final Pattern MARCAS = Pattern.compile("[<>{}\\\\]");

    private final EjemplarRepository ejemplares;
    private final PronunciacionRepository diccionario;
    private final TrabajoRepository trabajos;
    private final AlmacenDeArchivos almacen;
    private final ObjectMapper json;

    public PronunciacionServiceImpl(EjemplarRepository ejemplares, PronunciacionRepository diccionario,
                                    TrabajoRepository trabajos, AlmacenDeArchivos almacen, ObjectMapper json) {
        this.ejemplares = ejemplares;
        this.diccionario = diccionario;
        this.trabajos = trabajos;
        this.almacen = almacen;
        this.json = json;
    }

    @Override
    @Transactional(readOnly = true)
    public PronunciacionDTO ver(UUID ejemplarId) {
        Archivo a = archivoPropio(SecurityUtils.usuarioActual(), ejemplarId);
        return PronunciacionDTO.builder().entradas(diccionario.deArchivo(a.getId()))
                .regenerando(trabajos.regenerando(a.getId())).build();
    }

    @Override
    @Transactional
    public PronunciacionDTO guardar(UUID ejemplarId, List<PronunciacionEntradaDTO> entradas) {
        Long yo = SecurityUtils.usuarioActual();
        Archivo a = archivoPropio(yo, ejemplarId);
        List<PronunciacionEntradaDTO> nuevas = validar(entradas);
        UUID archivo = a.getId();
        Set<String> cambiadas = cambiadas(diccionario.deArchivo(archivo), nuevas);
        if (!cambiadas.isEmpty()) {
            diccionario.reemplazar(archivo, nuevas, yo);
            int enCola = trabajos.actualizarPronunciacionEnCola(archivo);
            int encolados = regenerar(archivo, cambiadas);
            log.info("Diccionario de pronunciacion del archivo {}: {} entrada(s), {} palabra(s) cambiada(s), "
                    + "{} trabajo(s) en cola actualizados, {} capitulo(s) a regenerar (usuario {})", archivo,
                    nuevas.size(), cambiadas.size(), enCola, encolados, yo);
        }
        return PronunciacionDTO.builder().entradas(diccionario.deArchivo(archivo))
                .regenerando(trabajos.regenerando(archivo)).build();
    }

    // ------------------------------------------------------------------ ayudas

    private Archivo archivoPropio(Long yo, UUID ejemplarId) {
        Ejemplar e = ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
        ValidationUtils.exigir(e.getArchivo() != null, Message.Msj.libroSinArchivo, CodigoError.DATO_INVALIDO);
        return e.getArchivo();
    }

    /**
     * Recorta espacios y valida: como mucho MAX_ENTRADAS; palabra de 1 a MAX_DE
     * caracteres con alguna letra o cifra; pronunciacion de 1 a MAX_A; sin
     * caracteres de control ni marcas (signos menor/mayor, llaves, barra invertida) en la pronunciacion; sin palabras repetidas (sin distinguir mayusculas).
     */
    static List<PronunciacionEntradaDTO> validar(List<PronunciacionEntradaDTO> entradas) {
        ValidationUtils.exigir(entradas != null, Message.Msj.cuerpoInvalido, CodigoError.DATO_INVALIDO);
        ValidationUtils.exigir(entradas.size() <= MAX_ENTRADAS, Message.Msj.demasiadasPronunciaciones,
                CodigoError.DATO_INVALIDO, MAX_ENTRADAS);
        List<PronunciacionEntradaDTO> limpias = new ArrayList<>();
        Map<String, Integer> vistas = new HashMap<>();
        for (int i = 0; i < entradas.size(); i++) {
            PronunciacionEntradaDTO e = entradas.get(i);
            String de = e == null || e.getDe() == null ? "" : espacios(e.getDe());
            String a = e == null || e.getA() == null ? "" : espacios(e.getA());
            boolean valida = !de.isEmpty() && de.length() <= MAX_DE && CON_LETRA.matcher(de).find()
                    && !a.isEmpty() && a.length() <= MAX_A && CON_LETRA.matcher(a).find()
                    && !CONTROL.matcher(de).find() && !CONTROL.matcher(a).find() && !MARCAS.matcher(a).find();
            ValidationUtils.exigir(valida, Message.Msj.pronunciacionInvalida, CodigoError.DATO_INVALIDO, i + 1,
                    MAX_DE, MAX_A);
            Integer antes = vistas.putIfAbsent(clave(de), i + 1);
            ValidationUtils.exigir(antes == null, Message.Msj.pronunciacionDuplicada, CodigoError.DATO_INVALIDO, de);
            limpias.add(new PronunciacionEntradaDTO(de, a));
        }
        return limpias;
    }

    /** Recorta y deja un solo espacio entre palabras (tabuladores y saltos tambien cuentan como control). */
    private static String espacios(String s) {
        return s.strip().replaceAll(" {2,}", " ");
    }

    private static String clave(String palabra) {
        return palabra.toLowerCase(Locale.ROOT);
    }

    /** Palabras (en minusculas) anadidas, quitadas o con otra pronunciacion. */
    static Set<String> cambiadas(List<PronunciacionEntradaDTO> antes, List<PronunciacionEntradaDTO> despues) {
        Map<String, String> viejo = new LinkedHashMap<>();
        for (PronunciacionEntradaDTO e : antes) viejo.put(clave(e.getDe()), e.getDe() + "\u0000" + e.getA());
        Map<String, String> nuevo = new LinkedHashMap<>();
        for (PronunciacionEntradaDTO e : despues) nuevo.put(clave(e.getDe()), e.getDe() + "\u0000" + e.getA());
        Set<String> cambiadas = new LinkedHashSet<>();
        for (Map.Entry<String, String> e : viejo.entrySet()) {
            if (!Objects.equals(e.getValue(), nuevo.get(e.getKey()))) cambiadas.add(e.getKey());
        }
        for (String k : nuevo.keySet()) {
            if (!viejo.containsKey(k)) cambiadas.add(k);
        }
        return cambiadas;
    }

    private int regenerar(UUID archivo, Set<String> cambiadas) {
        List<Pattern> patrones = cambiadas.stream()
                .map(p -> Pattern.compile("(?<![\\p{L}\\p{N}_])" + Pattern.quote(p) + "(?![\\p{L}\\p{N}_])",
                        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE))
                .toList();
        Map<Integer, Boolean> contiene = new HashMap<>();
        List<Map<String, Object>> audios = new ArrayList<>(trabajos.audiosListos(archivo));
        audios.addAll(trabajos.vozEnCurso(archivo));
        int encolados = 0;
        for (Map<String, Object> fila : audios) {
            Object voz = fila.get("voz_id");
            Object cap = fila.get("capitulo");
            if (voz == null || !(cap instanceof Number n)) continue;
            int capitulo = n.intValue();
            if (contiene.computeIfAbsent(capitulo, c -> contieneAlguna(archivo, c, patrones))
                    && trabajos.encolarRegeneracion(archivo, String.valueOf(voz), capitulo)) {
                encolados++;
            }
        }
        return encolados;
    }

    /** ¿El texto que lee la voz en ese capitulo contiene alguna de las palabras? Si no se puede leer: si. */
    private boolean contieneAlguna(UUID archivo, int capitulo, List<Pattern> patrones) {
        Path ruta = almacen.frases(archivo, capitulo);
        try {
            JsonNode raiz = json.readTree(Files.readString(ruta));
            for (JsonNode f : raiz.path("frases")) {
                String texto = f.hasNonNull("voz") ? f.get("voz").asText() : f.path("texto").asText("");
                for (Pattern p : patrones) {
                    if (p.matcher(texto).find()) return true;
                }
            }
            return false;
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo leer el texto del capitulo {} del archivo {} ({}): se regenera por si acaso",
                    capitulo, archivo, e.getMessage());
            return true;
        }
    }
}
