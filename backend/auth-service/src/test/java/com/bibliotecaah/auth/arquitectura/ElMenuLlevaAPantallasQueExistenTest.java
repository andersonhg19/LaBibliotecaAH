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
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * ============================================================================
 * EL MENU LLEVA A PANTALLAS QUE EXISTEN
 * ============================================================================
 *
 * El menu de la ola 4 sale de la base de datos: cada pagina guarda el nombre
 * de ruta con el que el navegador del movil conoce esa pantalla. Es un acuerdo
 * entre dos ficheros que no se compilan juntos —una migracion SQL en el
 * backend y un .tsx en el frontend— y esa clase de acuerdo se rompe en
 * silencio: nadie se entera hasta que alguien pulsa el boton y no pasa nada.
 *
 * Aqui se compara la lista de "route" que siembra V4 con los name="..." de
 * AppNavigator.tsx. Si alguien renombra una pantalla en el movil, esto se pone
 * rojo y dice cual.
 *
 * SI NO ENCUENTRA EL FRONTEND, LA PRUEBA SE SALTA en vez de fallar: el backend
 * tiene que poder construirse solo —en un contenedor de CI que solo clona
 * backend/, por ejemplo— sin que una comprobacion opcional lo impida.
 */
@DisplayName("El menu lleva a pantallas que existen de verdad")
class ElMenuLlevaAPantallasQueExistenTest {

    /**
     * Se miran TODAS las migraciones, no solo la que creo las tablas.
     *
     * La V4 sembro las primeras paginas y la V6 anadio la de auditoria; si
     * esto apuntara a un fichero concreto, cada migracion nueva entraria sin
     * vigilancia y la comprobacion se iria quedando vieja sin que nadie lo
     * note — que es exactamente como se pudren los guardarrailes.
     */
    private static final String MIGRACIONES = "src/main/resources/db/migration";
    private static final String NAVEGADOR = "frontend/src/navigation/AppNavigator.tsx";

    /**
     * Pantallas que la V4 siembra y que el navegador todavia no tiene, con el
     * motivo al lado.
     *
     * Esta vacia, y la idea es que siga vacia. Estuvo un rato con las tres de
     * administracion dentro —el menu se sembro antes de que las pantallas
     * existieran— y la segunda prueba de este fichero es la que obliga a
     * sacarlas en cuanto aparecieron: una lista de excepciones que nadie
     * revisa deja de ser una excepcion y pasa a ser un agujero.
     */
    private static final Set<String> AUN_NO_EXISTEN = Set.of();

    @Test
    @DisplayName("cada ruta sembrada corresponde con una pantalla del navegador")
    void cadaRutaExiste() {
        Path navegador = buscarNavegador();
        assumeTrue(navegador != null, "no encuentro el frontend desde aqui; prueba omitida");

        Set<String> pantallas = extraer(leer(navegador), "name=\"([A-Za-z0-9_]+)\"");
        Set<String> rutasSembradas = rutasDeLaMigracion();

        assertThat(rutasSembradas)
                .as("la migracion no siembra ninguna ruta: ¿cambio el formato del fichero?")
                .isNotEmpty();

        List<String> huerfanas = new ArrayList<>();
        for (String ruta : rutasSembradas) {
            if (AUN_NO_EXISTEN.contains(ruta)) continue;
            if (!pantallas.contains(ruta)) huerfanas.add(ruta);
        }

        assertThat(huerfanas)
                .as("""
                        estas rutas del menu no corresponden con ninguna pantalla del movil.

                          QUE HACER: o se renombro una pantalla en AppNavigator.tsx y hay que
                          actualizar la V4 (o escribir una migracion nueva si la V4 ya se
                          aplico en algun sitio), o la pantalla esta por escribir y va a
                          AUN_NO_EXISTEN en este fichero con el motivo al lado.

                          Un menu que apunta a una pantalla inexistente es un boton que no
                          hace nada, y no falla en ningun sitio: el usuario pulsa y se queda
                          mirando.""")
                .isEmpty();
    }

    @Test
    @DisplayName("la lista de pantallas por escribir no se pudre")
    void laListaDePendientesNoSePudre() {
        Path navegador = buscarNavegador();
        assumeTrue(navegador != null, "no encuentro el frontend desde aqui; prueba omitida");

        Set<String> pantallas = extraer(leer(navegador), "name=\"([A-Za-z0-9_]+)\"");

        List<String> yaExisten = AUN_NO_EXISTEN.stream().filter(pantallas::contains).toList();

        assertThat(yaExisten)
                .as("estas pantallas ya existen en el navegador: quitalas de AUN_NO_EXISTEN "
                        + "para que vuelvan a estar vigiladas")
                .isEmpty();
    }

    // ========================================================================

    private static Set<String> rutasDeLaMigracion() {
        /* La migracion escribe las paginas como
             SELECT 'modulo', 'code', 'Nombre', 'Ruta', 'icono', TRUE, 1
           asi que la ruta es el cuarto literal de cada linea que empieza por
           SELECT dentro del bloque de paginas. Se busca por forma —un
           identificador en mayuscula inicial— en vez de por posicion, que es
           mas robusto ante un cambio de columnas.

           Las migraciones posteriores pueden corregir o retirar rutas (la V8
           lo hace con las pantallas que se quitaron). Se aplican en orden de
           version, una sentencia por linea:
             UPDATE bah_auth_page SET route = 'Nueva', ... WHERE route = 'Vieja';
             DELETE FROM bah_auth_page WHERE route = 'Retirada';
           asi lo que se compara es lo que queda sembrado de verdad. */
        Pattern renombra = Pattern.compile(
                "^UPDATE bah_auth_page SET route = '([^']+)'.*WHERE route = '([^']+)'");
        Pattern retira = Pattern.compile("^DELETE FROM bah_auth_page WHERE route = '([^']+)'");

        Set<String> rutas = new LinkedHashSet<>();
        for (Path migracion : ficherosDeMigracion()) {
            for (String linea : leer(migracion).split("\\R")) {
                String limpia = linea.trim();
                Matcher m = renombra.matcher(limpia);
                if (m.find()) {
                    if (rutas.remove(m.group(2))) rutas.add(m.group(1));
                    continue;
                }
                m = retira.matcher(limpia);
                if (m.find()) {
                    rutas.remove(m.group(1));
                    continue;
                }
                if (!limpia.startsWith("SELECT '")) continue;
                /* Lista y no conjunto: en La Biblioteca AH el codigo, el nombre y
                   la ruta coinciden a menudo ('lector','Lector','Lector') y un
                   conjunto los colapsaba, desplazando la posicion de la ruta. */
                List<String> literales = new ArrayList<>();
                Matcher lit = Pattern.compile("'([^']*)'").matcher(limpia);
                while (lit.find()) literales.add(lit.group(1));
                /* modulo, code, nombre, RUTA, icono */
                if (literales.size() >= 4) rutas.add(literales.get(3));
            }
        }
        return rutas;
    }

    private static List<Path> ficherosDeMigracion() {
        try (var ficheros = Files.list(raizDelModulo().resolve(MIGRACIONES))) {
            /* Por numero de version y no por nombre: "V10__" va detras de "V9__". */
            return ficheros.filter(f -> f.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparingInt(ElMenuLlevaAPantallasQueExistenTest::version))
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("No puedo listar las migraciones", e);
        }
    }

    private static int version(Path migracion) {
        Matcher m = Pattern.compile("^V(\\d+)__").matcher(migracion.getFileName().toString());
        return m.find() ? Integer.parseInt(m.group(1)) : Integer.MAX_VALUE;
    }

    private static Set<String> extraer(String texto, String patron) {
        Matcher m = Pattern.compile(patron).matcher(texto);
        Set<String> encontrados = new LinkedHashSet<>();
        while (m.find()) encontrados.add(m.group(1));
        return encontrados;
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

    /** Sube por el arbol buscando la carpeta del movil. Puede no estar. */
    private static Path buscarNavegador() {
        Path actual = raizDelModulo();
        for (int i = 0; i < 4 && actual != null; i++) {
            Path candidato = actual.resolve(NAVEGADOR);
            if (Files.isRegularFile(candidato)) return candidato;
            actual = actual.getParent();
        }
        return null;
    }
}
