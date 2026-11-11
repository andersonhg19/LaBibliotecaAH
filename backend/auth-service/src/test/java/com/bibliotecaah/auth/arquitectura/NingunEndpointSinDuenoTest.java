package com.bibliotecaah.auth.arquitectura;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Controller;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * NINGUN ENDPOINT SIN DUENO
 * ============================================================================
 *
 * El gemelo de la prueba de budget-service, para el servicio de cuentas.
 *
 * Aqui el agujero fue justo este: la ola de identidad arreglo budget y despues
 * fasting, y UserController se quedo fuera porque nadie llevaba la cuenta de
 * que endpoints estaban cubiertos. Cualquier usuario autenticado podia leer la
 * ficha de otro, cambiarle el correo y darle de baja la cuenta.
 *
 * Recorre por reflexion todos los mapeos y exige que cada ruta este en uno de
 * estos dos sitios:
 *
 *   1. EN LA MATRIZ. No se escribe a mano: se lee del fichero fuente de
 *      AislamientoDeCuentasTest. Si alguien borra un caso de la matriz, la ruta
 *      se queda sin clasificar y esto se pone rojo.
 *   2. EXENTA, con el motivo escrito al lado.
 *
 * Una ruta nueva no cae en ninguno de los dos y la construccion se para.
 */
@DisplayName("Ningun endpoint sin dueno: toda la superficie HTTP esta clasificada")
class NingunEndpointSinDuenoTest {

    private static final String PAQUETE = "com.bibliotecaah.auth";

    /** La matriz de aislamiento de este servicio. Se lee, no se copia. */
    private static final String MATRIZ =
            "src/test/java/com/bibliotecaah/auth/security/AislamientoDeCuentasTest.java";

    /**
     * Rutas que no necesitan un caso en la matriz, con el motivo al lado.
     *
     * "representante" es la ruta de la matriz que ya demuestra la defensa de
     * esta: si se nombra una, tiene que estar de verdad en la matriz.
     */
    private static final Map<String, Exencion> EXENTAS = new LinkedHashMap<>();
    static {
        EXENTAS.put("/v1/auth/login", new Exencion(
                "publica por definicion: es donde se obtiene la identidad, todavia no hay token "
                        + "que consultar. Lo que protege es la contrasena, no el aislamiento", null));
        EXENTAS.put("/v1/auth/register", new Exencion(
                "publica por definicion: crea una cuenta nueva, no toca ninguna existente", null));
        EXENTAS.put("/v1/auth/renovar", new Exencion(
                "no recibe ningun identificador: renueva la sesion del propio token (userId del token)", null));
        EXENTAS.put("/v1/auth/sesion", new Exencion(
                "no recibe ningun identificador ni devuelve datos: solo confirma que el propio token vale", null));
    }

    /**
     * Deuda conocida: rutas que reciben un identificador ajeno y todavia no
     * tienen su caso en la matriz. Vacia, y la idea es que siga vacia.
     */
    private static final Map<String, String> PENDIENTES = new LinkedHashMap<>();

    /** Que hacer cuando esto se pone rojo. Se imprime con el fallo a proposito. */
    private static final String COMO_ARREGLARLO =
            "\n\n  QUE HACER: cada ruta de arriba es superficie HTTP que nadie ha clasificado."
                    + "\n  Elige una de las tres:"
                    + "\n    a) anade su caso a " + MATRIZ
                    + "\n       (Bruno, con token valido, intenta llegar a la cuenta de Ana y no lo consigue);"
                    + "\n    b) si es publica —login, registro— anadela a EXENTAS en este fichero"
                    + "\n       con el motivo escrito al lado;"
                    + "\n    c) si recibe un id ajeno y aun no esta defendida, anadela a PENDIENTES"
                    + "\n       describiendo el ataque concreto."
                    + "\n  Esta prueba existe porque la matriz cubria 24 de 56 endpoints y nada"
                    + "\n  obligaba al 57 a estar cubierto.\n";

    // ========================================================================

    @Test
    @DisplayName("toda ruta esta en la matriz, exenta con motivo, o anotada como deuda")
    void todaLaSuperficieHttpEstaClasificada() {
        Set<String> matriz = rutasQueEjercitaLaMatriz();

        List<String> sinClasificar = new ArrayList<>();
        for (Ruta ruta : rutasDeLosControllers()) {
            if (estaEnLaMatriz(ruta.clave(), matriz)) continue;
            if (EXENTAS.containsKey(ruta.clave())) continue;
            if (PENDIENTES.containsKey(ruta.clave())) continue;
            sinClasificar.add(ruta.descripcion());
        }

        assertThat(sinClasificar)
                .as("hay endpoints sin dueno" + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("la matriz de aislamiento sigue en su sitio y ejercita rutas")
    void laMatrizSigueEnSuSitio() {
        /* Si alguien mueve o renombra la matriz, el resto de esta prueba se
           quedaria sin nada contra lo que comparar y pasaria en verde diciendo
           que todo esta cubierto. */
        assertThat(rutasQueEjercitaLaMatriz())
                .as("no encuentro rutas en " + MATRIZ + ": ¿se movio la matriz de aislamiento? "
                        + "Actualiza la constante MATRIZ de este fichero")
                .isNotEmpty();
    }

    @Test
    @DisplayName("cada exencion que se apoya en otra ruta la nombra, y esa ruta esta en la matriz")
    void lasExencionesSeApoyanEnAlgoQueExiste() {
        Set<String> matriz = rutasQueEjercitaLaMatriz();

        List<String> rotas = new ArrayList<>();
        EXENTAS.forEach((ruta, exencion) -> {
            if (exencion.representante() == null) return;
            if (!estaEnLaMatriz(exencion.representante(), matriz)) {
                rotas.add(ruta + " dice apoyarse en " + exencion.representante()
                        + ", que ya no esta en la matriz");
            }
        });

        assertThat(rotas)
                .as("una exencion se apoya en una ruta que la matriz ya no ejercita: la exencion "
                        + "se quedo sin fundamento, o vuelve a poner ese caso en la matriz o "
                        + "escribe el suyo propio")
                .isEmpty();
    }

    @Test
    @DisplayName("el inventario no tiene rutas fantasma")
    void elInventarioNoTieneRutasFantasma() {
        /* Una exencion sobre una ruta que ya no existe es una lista que se
           pudre: el dia que vuelva a existir una ruta con ese nombre, entraria
           exenta sin que nadie lo decida. */
        Set<String> reales = new LinkedHashSet<>();
        rutasDeLosControllers().forEach(r -> reales.add(r.clave()));

        List<String> fantasmas = new ArrayList<>();
        EXENTAS.keySet().forEach(r -> { if (!reales.contains(r)) fantasmas.add("EXENTAS: " + r); });
        PENDIENTES.keySet().forEach(r -> { if (!reales.contains(r)) fantasmas.add("PENDIENTES: " + r); });

        assertThat(fantasmas)
                .as("estas rutas ya no existen en ningun controller: borralas del inventario "
                        + "de este fichero")
                .isEmpty();
    }

    // ========================================================================
    // Herramientas

    /** Un mapeo de un controller, ya resuelto a ruta completa. */
    private record Ruta(String verbo, String ruta, String clase, String metodo) {
        /** La ruta sin la parte variable: /v1/users/get/{id} -> /v1/users/get/ */
        String clave() {
            int llave = ruta.indexOf('{');
            return llave < 0 ? ruta : ruta.substring(0, llave);
        }

        String descripcion() {
            return verbo + " " + ruta + "  (" + clase + "#" + metodo + ")";
        }
    }

    private record Exencion(String motivo, String representante) { }

    private static List<Ruta> rutasDeLosControllers() {
        ClassPathScanningCandidateComponentProvider escaner =
                new ClassPathScanningCandidateComponentProvider(false);
        escaner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        escaner.addIncludeFilter(new AnnotationTypeFilter(Controller.class));

        List<Ruta> rutas = new ArrayList<>();
        for (BeanDefinition definicion : escaner.findCandidateComponents(PAQUETE)) {
            Class<?> controller = ClassUtils.resolveClassName(definicion.getBeanClassName(), null);
            RequestMapping raiz = AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
            List<String> prefijos = caminos(raiz);

            for (Method metodo : controller.getDeclaredMethods()) {
                RequestMapping mapeo = AnnotatedElementUtils.findMergedAnnotation(metodo, RequestMapping.class);
                if (mapeo == null) continue;
                String verbo = mapeo.method().length == 0 ? "ANY" : mapeo.method()[0].name();
                for (String prefijo : prefijos) {
                    for (String sufijo : caminos(mapeo)) {
                        rutas.add(new Ruta(verbo, prefijo + sufijo,
                                controller.getSimpleName(), metodo.getName()));
                    }
                }
            }
        }
        return rutas;
    }

    private static List<String> caminos(RequestMapping mapeo) {
        Set<String> caminos = new LinkedHashSet<>();
        if (mapeo != null) {
            caminos.addAll(Arrays.asList(mapeo.path()));
            caminos.addAll(Arrays.asList(mapeo.value()));
        }
        if (caminos.isEmpty()) caminos.add("");
        return new ArrayList<>(caminos);
    }

    /** Las rutas que la matriz ataca de verdad, leidas de su codigo fuente. */
    private static Set<String> rutasQueEjercitaLaMatriz() {
        Matcher literal = Pattern.compile("\"(/v1/[^\"]*)\"").matcher(leer(MATRIZ));
        Set<String> rutas = new LinkedHashSet<>();
        while (literal.find()) rutas.add(literal.group(1));
        return rutas;
    }

    /**
     * La matriz escribe las rutas con id como "/v1/users/get/" + id, asi que
     * para las rutas con {variable} basta con que el literal empiece igual.
     */
    private static boolean estaEnLaMatriz(String clave, Set<String> matriz) {
        if (matriz.contains(clave)) return true;
        return clave.endsWith("/") && matriz.stream().anyMatch(l -> l.startsWith(clave));
    }

    private static String leer(String rutaRelativa) {
        Path fichero = raizDelModulo().resolve(rutaRelativa);
        try {
            return Files.readString(fichero, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo leer " + fichero, e);
        }
    }

    /** Maven lanza las pruebas desde la raiz del modulo; el IDE, a veces no. */
    private static Path raizDelModulo() {
        Path actual = Paths.get("").toAbsolutePath();
        for (Path candidato : List.of(actual,
                actual.resolve("auth-service"),
                actual.resolve("backend/auth-service"))) {
            if (Files.isDirectory(candidato.resolve("src/main/java/com/bibliotecaah/auth"))) {
                return candidato;
            }
        }
        throw new IllegalStateException("No encuentro la raiz de auth-service desde " + actual);
    }
}
