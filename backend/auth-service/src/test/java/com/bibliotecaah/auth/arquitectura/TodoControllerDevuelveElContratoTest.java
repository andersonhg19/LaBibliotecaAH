package com.bibliotecaah.auth.arquitectura;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * TODO CONTROLLER DEVUELVE EL CONTRATO
 * ============================================================================
 *
 * La API entera habla ResultDTO con HTTP 200 y el frontend SOLO sabe leer eso:
 * mira "correct" y, si es false, ensena "message". Un metodo que devuelva otra
 * cosa —un Map suelto, la entidad, un 401 pelado— no rompe ninguna prueba del
 * servicio y sin embargo deja al usuario delante de una pantalla en blanco o de
 * un "Request failed with status code 401".
 *
 * En un servicio de cuentas duele el doble: la pantalla donde mas se equivoca
 * la gente al escribir es justo la de entrar.
 *
 * ContratoDeErroresTest defiende el contrato cuando algo falla; esta prueba lo
 * defiende antes, en la firma del metodo, y cubre TODOS los controllers en vez
 * de los que alguien se acuerde de anadir.
 */
@DisplayName("Todo controller devuelve ResponseEntity<ResultDTO>")
class TodoControllerDevuelveElContratoTest {

    private static final String PAQUETE = "com.bibliotecaah.auth";

    /** Metodos que devuelven otra cosa, con el motivo al lado. Ninguno. */
    private static final Map<String, String> EXENTOS = new LinkedHashMap<>();

    private static final String COMO_ARREGLARLO =
            "\n\n  QUE HACER: devuelve ResponseEntity<ResultDTO>. El frontend solo sabe leer eso"
                    + "\n  (mira \"correct\" y ensena \"message\"); cualquier otra forma le llega como una"
                    + "\n  pantalla en blanco. Si de verdad no es JSON —una descarga— anade el metodo"
                    + "\n  a EXENTOS en este fichero con el motivo escrito al lado.\n";

    // ========================================================================

    @Test
    @DisplayName("ningun metodo de controller se sale del contrato")
    void ningunMetodoSeSaleDelContrato() {
        List<String> culpables = new ArrayList<>();

        for (Method metodo : metodosExpuestos()) {
            String nombre = metodo.getDeclaringClass().getSimpleName() + "#" + metodo.getName();
            if (EXENTOS.containsKey(nombre)) continue;
            if (!devuelveElContrato(metodo)) {
                culpables.add(nombre + " devuelve " + metodo.getGenericReturnType().getTypeName());
            }
        }

        assertThat(culpables)
                .as("estos endpoints hablan un idioma que el frontend no entiende" + COMO_ARREGLARLO)
                .isEmpty();
    }

    @Test
    @DisplayName("las exenciones siguen existiendo y siguen siendo excepciones")
    void lasExencionesNoSePudren() {
        /* Una exencion sobre un metodo que ya no existe es un hueco abierto
           esperando a que alguien reutilice el nombre. */
        List<String> nombresReales = new ArrayList<>();
        for (Method metodo : metodosExpuestos()) {
            nombresReales.add(metodo.getDeclaringClass().getSimpleName() + "#" + metodo.getName());
        }

        List<String> obsoletas = new ArrayList<>();
        for (String exento : EXENTOS.keySet()) {
            if (!nombresReales.contains(exento)) {
                obsoletas.add(exento + " ya no existe");
            }
        }

        assertThat(obsoletas)
                .as("borra estas lineas de EXENTOS en este fichero: ya no protegen nada")
                .isEmpty();
    }

    // ========================================================================
    // Herramientas

    /** ResponseEntity<ResultDTO>, exactamente. */
    private static boolean devuelveElContrato(Method metodo) {
        if (!ResponseEntity.class.equals(metodo.getReturnType())) return false;
        Type devuelto = metodo.getGenericReturnType();
        if (!(devuelto instanceof ParameterizedType parametrizado)) return false;
        Type[] argumentos = parametrizado.getActualTypeArguments();
        return argumentos.length == 1 && ResultDTO.class.equals(argumentos[0]);
    }

    private static List<Method> metodosExpuestos() {
        ClassPathScanningCandidateComponentProvider escaner =
                new ClassPathScanningCandidateComponentProvider(false);
        escaner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        escaner.addIncludeFilter(new AnnotationTypeFilter(Controller.class));

        List<Method> metodos = new ArrayList<>();
        for (BeanDefinition definicion : escaner.findCandidateComponents(PAQUETE)) {
            Class<?> controller = ClassUtils.resolveClassName(definicion.getBeanClassName(), null);
            for (Method metodo : controller.getDeclaredMethods()) {
                if (AnnotatedElementUtils.findMergedAnnotation(metodo, RequestMapping.class) != null) {
                    metodos.add(metodo);
                }
            }
        }
        return metodos;
    }
}
