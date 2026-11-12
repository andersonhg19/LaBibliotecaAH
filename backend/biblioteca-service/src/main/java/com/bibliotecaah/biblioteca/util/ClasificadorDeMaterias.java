package com.bibliotecaah.biblioteca.util;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * La UNICA tabla de generos del proyecto: convierte las materias que traen los
 * archivos (EPUB dc:subject, palabras clave de PDF/DOCX) en una lista canonica
 * corta en espanol, y normaliza los generos que se escriben a mano.
 *
 * <ul>
 *   <li>Sinonimos (es/en, con o sin tildes) a un nombre canonico: "Fantastico",
 *       "fantasy" -> "Fantasía"; "Intriga", "Thriller", "Psicologico" -> "Suspense".</li>
 *   <li>Forma ("Novela", "Relato", "Cuento") y publico ("Juvenil", "Infantil",
 *       "Adulto") NO son generos: van a las etiquetas del ejemplar.</li>
 *   <li>Lo generico ("Ficcion", "Narrativa", "General") se descarta.</li>
 *   <li>Compuestos: "Novela historica" -> Novela + Histórica; "Fantasia juvenil"
 *       -> Fantasía + Juvenil; "Misterio y suspense" -> Suspense.</li>
 *   <li>Lo desconocido se conserva limpio, con mayuscula inicial.</li>
 *   <li>Texto mal decodificado: "RomÃ¡ntico" se repara; en "Rom\uFFFDntico" el
 *       caracter perdido vale por cualquiera al buscar en la tabla.</li>
 * </ul>
 */
public final class ClasificadorDeMaterias {

    /** Generos y etiquetas que salen de las materias de un archivo. */
    public record Clasificacion(List<String> generos, List<String> etiquetas) {
        public boolean vacia() {
            return generos.isEmpty() && etiquetas.isEmpty();
        }
    }

    /** Generos como mucho por obra al rellenar desde el archivo. */
    public static final int MAX_GENEROS = 10;
    /** Largo maximo de un genero (el de LibroSaveDTO). */
    public static final int MAX_LARGO = 100;

    private static final Map<String, String> GENEROS = new HashMap<>();
    private static final Map<String, String> ETIQUETAS = new HashMap<>();
    private static final Set<String> GENERICOS = new HashSet<>();
    /** Primera palabra que se puede quitar si lo que sigue es un genero: "novela historica". */
    private static final Set<String> PREFIJOS = Set.of("novela", "novelas", "literatura", "relato", "relatos",
            "cuento", "cuentos", "narrativa", "ficcion", "fiction", "genero");
    private static final Set<String> CONECTORES = Set.of("de", "del", "y", "e");
    private static final Pattern SEPARADORES = Pattern.compile("\\s*[;,/|]\\s*");
    private static final Pattern CONJUNCION = Pattern.compile("\\s+(?:y|e|and|&)\\s+", Pattern.CASE_INSENSITIVE);
    private static final Pattern BORDES = Pattern.compile("^[\\s\\p{Punct}¿¡«»“”‘’·•]+|[\\s\\p{Punct}¿¡«»“”‘’·•]+$");
    /** Codigos de clasificacion (BISAC "FIC009000", Dewey "863.64"): no son nombres. */
    private static final Pattern CODIGO = Pattern.compile(".*\\d{3,}.*");
    private static final char PERDIDO = '\uFFFD';

    static {
        genero("Fantasía", "fantasia", "fantastico", "fantastica", "fantasticos", "fantasticas", "fantasy",
                "fantasia epica", "fantasia heroica", "fantasia oscura", "fantasia urbana", "epic fantasy",
                "high fantasy", "dark fantasy", "urban fantasy", "espada y brujeria", "sword and sorcery");
        genero("Ciencia ficción", "ciencia ficcion", "ciencia-ficcion", "cienciaficcion", "sci-fi", "scifi",
                "sci fi", "science fiction", "ficcion cientifica", "cf", "distopia", "distopica", "distopico",
                "dystopia", "dystopian", "ucronia", "space opera", "cyberpunk", "steampunk");
        genero("Romance", "romance", "romantico", "romantica", "romanticos", "romanticas", "romantic", "amor",
                "amorosa", "rosa", "love", "love stories", "chick lit");
        genero("Suspense", "suspense", "suspenso", "intriga", "thriller", "thrillers", "psicologico",
                "psicologica", "thriller psicologico", "suspense psicologico", "psychological",
                "psychological thriller", "misterio", "misterios", "mystery", "mysteries", "mystery & detective");
        genero("Policiaca", "policiaca", "policiaco", "policiacas", "policiacos", "policial", "policiales",
                "crimen", "crimenes", "crime", "crime fiction", "true crime", "negra", "noir", "detective",
                "detectives", "detectivesca", "detectivesco");
        genero("Terror", "terror", "horror", "miedo", "gotico", "gotica", "gothic");
        genero("Histórica", "historica", "historico", "historicas", "historicos", "historical",
                "historical fiction", "ficcion historica");
        genero("Biografía", "biografia", "biografias", "autobiografia", "autobiografias", "memorias",
                "biografias y memorias", "biography", "biographies", "autobiography", "memoir", "memoirs",
                "biography & autobiography");
        genero("Ensayo", "ensayo", "ensayos", "ensayistica", "essay", "essays");
        genero("Autoayuda", "autoayuda", "auto ayuda", "auto-ayuda", "self-help", "self help",
                "superacion personal", "desarrollo personal", "crecimiento personal", "personal development");
        genero("Poesía", "poesia", "poesias", "poema", "poemas", "poemario", "lirica", "poetry");
        genero("Teatro", "teatro", "dramaturgia", "obra de teatro", "theatre", "theater", "plays", "drama teatral");
        genero("Aventuras", "aventura", "aventuras", "adventure", "adventures", "accion", "accion y aventura",
                "action", "action & adventure", "action and adventure");
        genero("Humor", "humor", "humoristico", "humoristica", "comedia", "comedy", "humorous", "humour",
                "satira");
        genero("Erótica", "erotica", "erotico", "eroticas", "eroticos", "erotismo", "erotic", "erotic fiction");
        genero("Bélica", "belica", "belico", "guerra", "war", "military", "militar");
        genero("Cómic", "comic", "comics", "manga", "novela grafica", "graphic novel", "graphic novels",
                "historieta", "historietas");
        genero("Clásicos", "clasico", "clasicos", "clasica", "clasicas", "classic", "classics");
        genero("Filosofía", "filosofia", "philosophy");
        genero("Mitología", "mitologia", "mythology");
        genero("Western", "western", "westerns", "oeste", "del oeste");

        etiqueta("Novela", "novela", "novelas", "novel", "novels", "novela corta", "nouvelle");
        etiqueta("Relatos", "relato", "relatos", "relato corto", "relatos cortos", "cuento", "cuentos",
                "cuentos cortos", "short stories", "short story");
        etiqueta("Juvenil", "juvenil", "juveniles", "literatura juvenil", "young adult", "young adult fiction",
                "ya", "adolescente", "adolescentes", "juvenile", "juvenile fiction", "teen", "teens");
        etiqueta("Infantil", "infantil", "infantiles", "literatura infantil", "ninos", "ninas", "children",
                "childrens", "children's", "children's fiction", "kids");
        etiqueta("Adulto", "adulto", "adultos", "adult", "adults", "new adult");

        GENERICOS.addAll(List.of("ficcion", "fiction", "general", "literatura", "narrativa", "otros", "otras",
                "varios", "varias", "miscelanea", "ebook", "e-book", "libro", "libros", "book", "books",
                "ficcion general", "general fiction", "fiction general", "literary", "literary fiction",
                "ficcion literaria", "contemporanea", "contemporaneo", "contemporary", "contemporary fiction",
                "narrativa contemporanea", "literatura contemporanea", "sin clasificar", "unknown",
                "desconocido", "nonfiction", "non-fiction", "no ficcion", "fic", "spanish", "espanol",
                "castellano", "english", "genero"));
    }

    private ClasificadorDeMaterias() {}

    private static void genero(String canonico, String... claves) {
        for (String c : claves) GENEROS.put(c, canonico);
        GENEROS.put(clave(canonico), canonico);
    }

    private static void etiqueta(String canonico, String... claves) {
        for (String c : claves) ETIQUETAS.put(c, canonico);
        ETIQUETAS.put(clave(canonico), canonico);
    }

    // ------------------------------------------------------------------ API

    /**
     * Clasifica las materias de un archivo. Cada materia puede traer varias
     * separadas por ";", ",", "/" o "|".
     */
    public static Clasificacion clasificar(Collection<String> materias) {
        Acumulador acc = new Acumulador();
        if (materias != null) {
            for (String materia : materias) {
                if (materia == null) continue;
                for (String parte : SEPARADORES.split(reparar(materia))) {
                    String limpia = limpiar(parte);
                    if (limpia.isEmpty()) continue;
                    if (!resolver(limpia, acc, 0)) acc.desconocido(limpia);
                }
            }
        }
        List<String> generos = acc.generos.values().stream().limit(MAX_GENEROS).toList();
        return new Clasificacion(new ArrayList<>(generos), new ArrayList<>(acc.etiquetas.values()));
    }

    /**
     * Generos escritos a mano: los sinonimos conocidos pasan a su nombre
     * canonico ("fantastico" -> "Fantasía"); lo demas se respeta tal cual lo
     * escribio el usuario (aunque sea "Novela"). Sin repetidos.
     */
    public static List<String> normalizarGeneros(Collection<String> generos) {
        Map<String, String> unicos = new LinkedHashMap<>();
        if (generos == null) return new ArrayList<>();
        for (String g : generos) {
            if (g == null || g.isBlank()) continue;
            String limpio = g.trim();
            String canonico = buscar(GENEROS, clave(limpio));
            String valor = canonico != null ? canonico : limpio;
            unicos.putIfAbsent(valor.toLowerCase(Locale.ROOT), valor);
        }
        return new ArrayList<>(unicos.values());
    }

    // ------------------------------------------------------------------ resolucion

    /** true si el texto se reconocio (aunque sea para descartarlo). */
    private static boolean resolver(String texto, Acumulador acc, int profundidad) {
        String k = clave(texto);
        if (k.isEmpty() || buscar(GENERICOS, k) != null) return true;
        String g = buscar(GENEROS, k);
        if (g != null) {
            acc.genero(g);
            return true;
        }
        String e = buscar(ETIQUETAS, k);
        if (e != null) {
            acc.etiqueta(e);
            return true;
        }
        if (profundidad >= 2) return false;
        String[] palabras = texto.split("\\s+");
        if (palabras.length < 2) return false;

        /* "Novela histórica", "Relatos de terror": forma + genero. */
        if (PREFIJOS.contains(clave(palabras[0]))) {
            Acumulador resto = new Acumulador();
            if (resolver(unir(palabras, 1, palabras.length), resto, profundidad + 1)) {
                resolver(palabras[0], acc, profundidad + 1);
                acc.sumar(resto);
                return true;
            }
        }
        /* "Fantasía juvenil", "Ciencia ficción para adultos": genero + publico. */
        String ultima = buscar(ETIQUETAS, clave(palabras[palabras.length - 1]));
        if (ultima != null) {
            Acumulador resto = new Acumulador();
            String antes = unir(palabras, 0, palabras.length - 1).replaceAll("(?i)\\s+para$", "");
            if (!antes.isEmpty() && resolver(antes, resto, profundidad + 1)) {
                acc.sumar(resto);
                acc.etiqueta(ultima);
                return true;
            }
        }
        /* "Misterio y suspense", "Infantil y juvenil", "Action & Adventure". */
        String[] partes = CONJUNCION.split(texto);
        if (partes.length > 1) {
            Acumulador todas = new Acumulador();
            for (String p : partes) {
                if (!resolver(p, todas, profundidad + 1)) return false;
            }
            acc.sumar(todas);
            return true;
        }
        return false;
    }

    /** Une palabras[desde..hasta) quitando conectores sueltos al principio y al final ("de terror"). */
    private static String unir(String[] palabras, int desde, int hasta) {
        List<String> trozo = new ArrayList<>(Arrays.asList(palabras).subList(desde, hasta));
        while (!trozo.isEmpty() && CONECTORES.contains(clave(trozo.get(0)))) trozo.remove(0);
        while (!trozo.isEmpty() && CONECTORES.contains(clave(trozo.get(trozo.size() - 1)))) {
            trozo.remove(trozo.size() - 1);
        }
        return String.join(" ", trozo);
    }

    /** Busqueda exacta; si la clave trae caracteres perdidos (U+FFFD), cada uno vale por cualquier letra. */
    private static String buscar(Map<String, String> tabla, String k) {
        String exacto = tabla.get(k);
        if (exacto != null || k.indexOf(PERDIDO) < 0) return exacto;
        for (Map.Entry<String, String> e : tabla.entrySet()) {
            if (comodin(k, e.getKey())) return e.getValue();
        }
        return null;
    }

    private static String buscar(Set<String> conjunto, String k) {
        if (conjunto.contains(k)) return k;
        if (k.indexOf(PERDIDO) < 0) return null;
        return conjunto.stream().filter(c -> comodin(k, c)).findFirst().orElse(null);
    }

    private static boolean comodin(String conPerdidos, String candidato) {
        if (conPerdidos.length() != candidato.length()) return false;
        for (int i = 0; i < candidato.length(); i++) {
            char c = conPerdidos.charAt(i);
            if (c != PERDIDO && c != candidato.charAt(i)) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ texto

    /** Minusculas, sin tildes, espacios simples y sin puntuacion en los bordes. */
    static String clave(String s) {
        String sinTildes = Normalizer.normalize(reparar(s), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return limpiar(sinTildes).toLowerCase(Locale.ROOT).replace('’', '\'');
    }

    private static String limpiar(String s) {
        return BORDES.matcher(s.replaceAll("\\s+", " ")).replaceAll("").trim();
    }

    /** "RomÃ¡ntico" (UTF-8 leido como Latin-1) -> "Romántico". Si no encaja, se deja como estaba. */
    static String reparar(String s) {
        if (s == null) return "";
        if (s.indexOf('Ã') < 0 && s.indexOf('Â') < 0) return s;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 0xFF) return s;
        }
        String r = new String(s.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
        return r.indexOf(PERDIDO) >= 0 ? s : r;
    }

    /** Mayuscula inicial; lo que viene TODO EN MAYUSCULAS pasa a minusculas primero. */
    static String presentable(String s) {
        String base = s.equals(s.toUpperCase(Locale.ROOT)) ? s.toLowerCase(Locale.ROOT) : s;
        return base.substring(0, 1).toUpperCase(Locale.ROOT) + base.substring(1);
    }

    private static final class Acumulador {
        private final Map<String, String> generos = new LinkedHashMap<>();
        private final Map<String, String> etiquetas = new LinkedHashMap<>();

        void genero(String g) {
            generos.putIfAbsent(g.toLowerCase(Locale.ROOT), g);
        }

        void etiqueta(String e) {
            etiquetas.putIfAbsent(e.toLowerCase(Locale.ROOT), e);
        }

        /** Lo que no esta en la tabla se conserva como genero, salvo codigos, ilegibles o tamanos raros. */
        void desconocido(String texto) {
            if (texto.length() < 2 || texto.length() > MAX_LARGO || texto.indexOf(PERDIDO) >= 0
                    || CODIGO.matcher(texto).matches()) {
                return;
            }
            genero(presentable(texto));
        }

        void sumar(Acumulador otro) {
            otro.generos.values().forEach(this::genero);
            otro.etiquetas.values().forEach(this::etiqueta);
        }
    }
}
