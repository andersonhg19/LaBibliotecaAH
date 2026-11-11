package com.bibliotecaah.auth.arquitectura;

import jakarta.validation.constraints.NotNull;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.util.ClassUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * LA IDENTIDAD NO VUELVE AL CUERPO
 * ============================================================================
 *
 * Quien eres lo dice el token, nunca la peticion. En este servicio la version
 * del fallo era todavia mas directa: con el id de otra persona en el cuerpo se
 * le cambiaba el correo y la contrasena, o se le daba de baja la cuenta.
 *
 * Vigila las dos formas que tiene la identidad de volver al cuerpo:
 *
 *   1. Un @NotNull sobre un campo userId de un DTO de entrada. Ese @NotNull
 *      dice "el cliente TIENE que decirme quien es", que es exactamente la
 *      frase que se elimino del proyecto.
 *   2. Un body.get("userId") o un dto.getUserId() dentro de un controller: el
 *      controller haciendo caso de lo que el cliente dice ser.
 *
 * Las dos listas de excepciones estan vacias a proposito: en este servicio no
 * hay ni una sola justificada. Que sigan vacias.
 */
@DisplayName("La identidad no vuelve al cuerpo: el userId sale del token")
class LaIdentidadNoVuelveAlCuerpoTest {

    private static final String PAQUETE_DTOS = "com.bibliotecaah.auth.dto.input";
    private static final String CONTROLLERS = "src/main/java/com/bibliotecaah/auth/controller";

    /** DTOs a los que se les permite exigir un userId, con el motivo. Ninguno. */
    private static final Map<String, String> DTOS_EXENTOS = new LinkedHashMap<>();

    /**
     * Controllers a los que se les permite leer el userId del cuerpo, con el
     * numero exacto de veces. El numero es el candado: una lectura mas y esto
     * se pone rojo aunque el fichero ya estuviera en la lista.
     */
    private static final Map<String, Permiso> CONTROLLERS_EXENTOS = new LinkedHashMap<>();

    private static final String COMO_ARREGLARLO =
            "\n\n  QUE HACER: el userId lo pone el token, no el cliente."
                    + "\n  Usa SecurityUtils.getAuthenticatedUserId() en el controller y deja el"
                    + "\n  campo del DTO sin @NotNull (el frontend puede seguir enviandolo: se ignora)."
                    + "\n  Si de verdad es una excepcion —el userId es SOBRE quien se actua, no QUIEN"
                    + "\n  actua— anadela a la lista de exentos de este fichero con el motivo.\n";

    // ========================================================================

    @Test
    @DisplayName("ningun DTO de entrada exige un userId")
    void ningunDtoExigeElUserId() {
        List<String> culpables = new ArrayList<>();
        for (Class<?> dto : dtosDeEntrada()) {
            if (DTOS_EXENTOS.containsKey(dto.getSimpleName())) continue;
            for (Field campo : dto.getDeclaredFields()) {
                if ("userId".equals(campo.getName()) && campo.isAnnotationPresent(NotNull.class)) {
                    culpables.add(dto.getSimpleName() + ".userId");
                }
            }
        }

        assertThat(culpables)
                .as("estos DTO obligan al cliente a declarar quien es" + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("los DTO exentos siguen siendolo por el motivo escrito")
    void lasExencionesDeDtoNoSePudren() {
        /* Una lista de excepciones que nadie poda acaba tapando casos que ya
           no son excepciones. */
        List<String> obsoletos = new ArrayList<>();
        for (String nombre : DTOS_EXENTOS.keySet()) {
            boolean sigueExigiendolo = dtosDeEntrada().stream()
                    .filter(d -> d.getSimpleName().equals(nombre))
                    .flatMap(d -> Stream.of(d.getDeclaredFields()))
                    .anyMatch(c -> "userId".equals(c.getName()) && c.isAnnotationPresent(NotNull.class));
            if (!sigueExigiendolo) obsoletos.add(nombre);
        }

        assertThat(obsoletos)
                .as("buena noticia: estos DTO ya no exigen el userId. Borra su linea de "
                        + "DTOS_EXENTOS en este fichero")
                .isEmpty();
    }

    @Test
    @DisplayName("ningun controller lee el userId del cuerpo")
    void ningunControllerLeeElUserIdDelCuerpo() {
        List<String> culpables = new ArrayList<>();

        for (Path fichero : ficherosDeControllers()) {
            String nombre = fichero.getFileName().toString();
            int lecturas = vecesQueLeeElUserId(sinComentarios(leer(fichero)));
            int permitidas = CONTROLLERS_EXENTOS.containsKey(nombre)
                    ? CONTROLLERS_EXENTOS.get(nombre).veces() : 0;

            if (lecturas > permitidas) {
                culpables.add(nombre + ": lee el userId del cuerpo " + lecturas
                        + " veces y solo hay " + permitidas + " justificadas");
            }
        }

        assertThat(culpables)
                .as("un controller volvio a creerse lo que el cliente dice ser" + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("las lecturas justificadas siguen siendo exactamente las que dice la lista")
    void lasExencionesDeControllerNoSePudren() {
        List<String> desajustes = new ArrayList<>();

        CONTROLLERS_EXENTOS.forEach((nombre, permiso) -> {
            Path fichero = raizDelModulo().resolve(CONTROLLERS).resolve(nombre);
            if (!Files.exists(fichero)) {
                desajustes.add(nombre + " ya no existe: borra su linea de CONTROLLERS_EXENTOS");
                return;
            }
            int lecturas = vecesQueLeeElUserId(sinComentarios(leer(fichero)));
            if (lecturas < permiso.veces()) {
                desajustes.add(nombre + " ya solo lo lee " + lecturas + " veces (la lista dice "
                        + permiso.veces() + "): baja el numero o borra la linea");
            }
        });

        assertThat(desajustes)
                .as("el candado de las exenciones quedo por encima de la realidad y deja hueco "
                        + "para una lectura nueva sin que nadie se entere")
                .isEmpty();
    }

    // ========================================================================
    // Herramientas

    private record Permiso(int veces, String motivo) { }

    private static List<Class<?>> dtosDeEntrada() {
        ClassPathScanningCandidateComponentProvider escaner =
                new ClassPathScanningCandidateComponentProvider(false);
        escaner.addIncludeFilter((lector, fabrica) -> true);

        List<Class<?>> dtos = new ArrayList<>();
        for (BeanDefinition definicion : escaner.findCandidateComponents(PAQUETE_DTOS)) {
            dtos.add(ClassUtils.resolveClassName(definicion.getBeanClassName(), null));
        }
        return dtos;
    }

    private static List<Path> ficherosDeControllers() {
        Path carpeta = raizDelModulo().resolve(CONTROLLERS);
        try (Stream<Path> ficheros = Files.list(carpeta)) {
            return ficheros.filter(f -> f.toString().endsWith(".java")).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo listar " + carpeta, e);
        }
    }

    /** body.get("userId") y dto.getUserId(): las dos formas de preguntarselo al cliente. */
    private static int vecesQueLeeElUserId(String codigo) {
        Matcher lectura = Pattern.compile("\\.get\\(\\s*\"userId\"\\s*\\)|\\.getUserId\\(\\s*\\)")
                .matcher(codigo);
        int veces = 0;
        while (lectura.find()) veces++;
        return veces;
    }

    /** Los comentarios de este proyecto CUENTAN la historia vieja; no son codigo. */
    private static String sinComentarios(String codigo) {
        return codigo.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("//[^\n]*", " ");
    }

    private static String leer(Path fichero) {
        try {
            return Files.readString(fichero, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo leer " + fichero, e);
        }
    }

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
