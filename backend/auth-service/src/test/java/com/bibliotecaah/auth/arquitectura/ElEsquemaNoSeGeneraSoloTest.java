package com.bibliotecaah.auth.arquitectura;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * EL ESQUEMA NO SE GENERA SOLO
 * ============================================================================
 *
 * Los servicios arrancaban con ddl-auto=update. Con "update" Hibernate se
 * inventa el esquema al arrancar y, cuando el cambio no le cabe —un NOT NULL
 * sobre una tabla que ya tiene datos, una columna que cambia de tipo— lo deja
 * en un WARN en el log y la aplicacion arranca IGUAL, con la base de datos
 * desincronizada del mapeo. El fallo aparece semanas despues, en produccion,
 * como un dato que no se guarda.
 *
 * Con "validate" el esquema lo pone Flyway y Hibernate solo comprueba que
 * coincida: si no coincide, la aplicacion no arranca. Un fallo ruidoso el dia
 * del despliegue en vez de uno silencioso el mes que viene.
 *
 * Esta prueba mira TODOS los servicios, no solo el suyo: revisa cada perfil de
 * cada application*.properties y cada @TestPropertySource del arbol. Un
 * servicio nuevo con "update" tambien se cae aqui.
 */
@DisplayName("El esquema no se genera solo: ddl-auto=validate en todos los perfiles")
class ElEsquemaNoSeGeneraSoloTest {

    private static final String ESPERADO = "validate";

    /**
     * Perfiles que pueden no decir "validate", con el motivo y el valor
     * permitido. Esta vacia: la unica que hubo era la del perfil de pruebas de
     * fasting-service, y ese servicio se retiro del proyecto.
     */
    private static final Map<String, Exencion> EXENTOS = new LinkedHashMap<>();

    /** Valores que no se pueden usar ni con exencion: son los que corrompen en silencio. */
    private static final List<String> PROHIBIDOS = List.of("update", "create", "create-only");

    private static final String COMO_ARREGLARLO =
            "\n\n  QUE HACER: pon spring.jpa.hibernate.ddl-auto=validate y escribe una migracion"
                    + "\n  de Flyway con el cambio de esquema. Con \"update\", anadir una columna a una"
                    + "\n  tabla con datos falla como WARN y la aplicacion arranca igual, con el"
                    + "\n  esquema desincronizado del mapeo: el fallo no sale hasta produccion.\n";

    // ========================================================================

    @Test
    @DisplayName("ningun perfil de ningun servicio deja que Hibernate se invente el esquema")
    void todosLosPerfilesValidan() {
        List<String> culpables = new ArrayList<>();

        declaraciones().forEach((fichero, valor) -> {
            Exencion exencion = EXENTOS.get(fichero);
            String permitido = exencion != null ? exencion.valorPermitido() : ESPERADO;
            if (!permitido.equals(valor)) {
                culpables.add(fichero + " dice ddl-auto=" + valor + " (se espera " + permitido + ")");
            }
        });

        assertThat(culpables)
                .as("hay perfiles que dejan el esquema en manos de Hibernate" + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("\"update\" y \"create\" no se permiten en ningun sitio, ni con exencion")
    void nadieUsaLosValoresQueCorrompenEnSilencio() {
        List<String> culpables = new ArrayList<>();
        declaraciones().forEach((fichero, valor) -> {
            if (PROHIBIDOS.contains(valor)) culpables.add(fichero + " -> " + valor);
        });

        assertThat(culpables)
                .as("estos valores modifican una base con datos sin que nadie lo autorice"
                        + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("se esta mirando de verdad a los dos servicios")
    void seMiranLosDosServicios() {
        /* Si el recorrido se rompe (otra estructura de carpetas, otro sitio
           desde donde se lanza Maven) esta prueba pasaria en verde sin haber
           mirado nada. */
        assertThat(declaraciones().keySet())
                .as("no encuentro los application.properties de los servicios: el recorrido "
                        + "del arbol dejo de funcionar y esta prueba no esta comprobando nada")
                .anyMatch(f -> f.startsWith("auth-service/src/main"))
                .anyMatch(f -> f.startsWith("biblioteca-service/src/main"));
    }

    // ========================================================================
    // Herramientas

    private record Exencion(String valorPermitido, String motivo) { }

    /** Cada sitio del arbol donde se declara un ddl-auto, con su valor. */
    private static Map<String, String> declaraciones() {
        Map<String, String> encontradas = new LinkedHashMap<>();
        Path raiz = raizDelBackend();

        try (Stream<Path> arbol = Files.walk(raiz)) {
            arbol.filter(Files::isRegularFile)
                    .filter(ElEsquemaNoSeGeneraSoloTest::esFicheroDeConfiguracion)
                    .sorted()
                    .forEach(fichero -> {
                        String texto = sinComentarios(fichero, leer(fichero));
                        Matcher declara = Pattern
                                .compile("ddl-auto\\s*[:=]\\s*\"?([A-Za-z-]+)")
                                .matcher(texto);
                        while (declara.find()) {
                            encontradas.put(relativa(raiz, fichero), declara.group(1));
                        }
                    });
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo recorrer " + raiz, e);
        }
        return encontradas;
    }

    private static boolean esFicheroDeConfiguracion(Path fichero) {
        String ruta = fichero.toString().replace('\\', '/');
        if (ruta.contains("/target/") || !ruta.contains("/src/")) return false;
        return ruta.endsWith(".properties") || ruta.endsWith(".yml")
                || ruta.endsWith(".yaml") || ruta.endsWith(".java");
    }

    /**
     * Los comentarios de este proyecto explican el "update" que habia antes.
     * Contarlos como configuracion seria un falso positivo eterno.
     */
    private static String sinComentarios(Path fichero, String texto) {
        if (fichero.toString().endsWith(".java")) {
            return texto.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("//[^\n]*", " ");
        }
        return texto.replaceAll("(?m)^\\s*[#!].*$", " ");
    }

    private static String contenido(String rutaRelativa) {
        return leer(raizDelBackend().resolve(rutaRelativa));
    }

    private static String relativa(Path raiz, Path fichero) {
        return raiz.relativize(fichero).toString().replace('\\', '/');
    }

    private static String leer(Path fichero) {
        try {
            return Files.readString(fichero, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo leer " + fichero, e);
        }
    }

    /** La carpeta que contiene los modulos; Maven lanza desde la raiz del modulo. */
    private static Path raizDelBackend() {
        Path actual = Paths.get("").toAbsolutePath();
        for (Path candidato : Arrays.asList(actual, actual.getParent(),
                actual.resolve("backend"))) {
            if (candidato != null
                    && Files.isDirectory(candidato.resolve("auth-service/src"))
                    && Files.isDirectory(candidato.resolve("biblioteca-service/src"))) {
                return candidato;
            }
        }
        throw new IllegalStateException("No encuentro la raiz del backend desde " + actual);
    }
}
