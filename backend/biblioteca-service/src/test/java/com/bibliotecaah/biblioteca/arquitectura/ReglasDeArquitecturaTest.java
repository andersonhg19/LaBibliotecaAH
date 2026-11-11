package com.bibliotecaah.biblioteca.arquitectura;

import com.bibliotecaah.biblioteca.controller.ArchivoController;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.io.Resource;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pruebas de arquitectura (estandares §28) heredadas de Oh Churus y adaptadas:
 * la identidad no vuelve al cuerpo, todo controller devuelve el contrato, ningun
 * servicio se salta al usuario del token y ningun texto al usuario se escribe a mano.
 */
@DisplayName("Reglas de arquitectura de biblioteca-service")
class ReglasDeArquitecturaTest {

    private static final String RAIZ = "com.bibliotecaah.biblioteca";
    private static final Path FUENTES = Path.of("src/main/java/com/bibliotecaah/biblioteca");

    private static List<Class<?>> clasesDe(String paquete, boolean soloControllers) {
        ClassPathScanningCandidateComponentProvider escaner = new ClassPathScanningCandidateComponentProvider(false);
        if (soloControllers) escaner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        else escaner.addIncludeFilter((l, f) -> true);
        List<Class<?>> clases = new ArrayList<>();
        for (BeanDefinition d : escaner.findCandidateComponents(paquete)) {
            clases.add(ClassUtils.resolveClassName(d.getBeanClassName(), null));
        }
        return clases;
    }

    @Nested
    @DisplayName("La identidad no vuelve al cuerpo")
    class Identidad {

        @Test
        @DisplayName("ningun DTO de entrada o filtro tiene un campo userId/usuarioId")
        void sinUserIdEnElCuerpo() {
            List<String> culpables = new ArrayList<>();
            for (String paquete : List.of(RAIZ + ".dto.input", RAIZ + ".dto.filter")) {
                for (Class<?> dto : clasesDe(paquete, false)) {
                    for (Field campo : dto.getDeclaredFields()) {
                        String n = campo.getName().toLowerCase();
                        if (n.equals("userid") || n.equals("usuarioid") || n.equals("iduser")) {
                            culpables.add(dto.getSimpleName() + "." + campo.getName());
                        }
                    }
                }
            }
            assertThat(clasesDe(RAIZ + ".dto.input", false)).as("el escaneo encuentra los DTO").hasSizeGreaterThan(5);
            assertThat(culpables).as("la identidad sale del token (SecurityUtils), nunca del cuerpo").isEmpty();
        }

        @Test
        @DisplayName("todo servicio que toca datos del usuario pregunta al token quien es")
        void losServiciosUsanElToken() throws IOException {
            List<String> sinToken = new ArrayList<>();
            try (Stream<Path> ficheros = Files.list(FUENTES.resolve("service/impl"))) {
                for (Path f : ficheros.filter(p -> p.toString().endsWith("ServiceImpl.java")).toList()) {
                    String codigo = Files.readString(f);
                    boolean exento = f.getFileName().toString().equals("IngestaServiceImpl.java")
                            || f.getFileName().toString().equals("VozServiceImpl.java");
                    if (!exento && !codigo.contains("SecurityUtils.usuarioActual()")) {
                        sinToken.add(f.getFileName().toString());
                    }
                }
            }
            assertThat(sinToken)
                    .as("IngestaServiceImpl recibe el usuario de LibroServiceImpl o del buzon; VozServiceImpl no tiene datos de nadie")
                    .isEmpty();
        }
    }

    @Nested
    @DisplayName("Contrato de los controllers")
    class Contrato {

        @Test
        @DisplayName("todo endpoint es POST y devuelve ResponseEntity<ResultDTO>; solo ArchivoController sirve binarios por GET")
        void todoDevuelveElContrato() {
            List<String> culpables = new ArrayList<>();
            List<Class<?>> controllers = clasesDe(RAIZ + ".controller", true);
            assertThat(controllers).hasSize(8);
            for (Class<?> c : controllers) {
                for (Method m : c.getDeclaredMethods()) {
                    boolean esPost = m.isAnnotationPresent(PostMapping.class);
                    boolean esOtro = m.isAnnotationPresent(GetMapping.class) || m.isAnnotationPresent(RequestMapping.class);
                    if (!esPost && !esOtro) continue;
                    Class<?> cuerpo = cuerpoDe(m);
                    if (c == ArchivoController.class) {
                        if (cuerpo != Resource.class) culpables.add(c.getSimpleName() + "." + m.getName());
                    } else if (!esPost || cuerpo != ResultDTO.class) {
                        culpables.add(c.getSimpleName() + "." + m.getName());
                    }
                }
            }
            assertThat(culpables).isEmpty();
        }

        private Class<?> cuerpoDe(Method m) {
            if (m.getReturnType() != ResponseEntity.class) return m.getReturnType();
            if (m.getGenericReturnType() instanceof ParameterizedType p
                    && p.getActualTypeArguments()[0] instanceof Class<?> k) {
                return k;
            }
            return Object.class;
        }
    }

    @Nested
    @DisplayName("Mensajes")
    class Mensajes {

        @Test
        @DisplayName("cada clave de Message.Msj tiene su texto en messages_es.properties, y no sobra ninguno")
        void todasLasClavesTienenTexto() throws IOException {
            Properties textos = new Properties();
            try (InputStream in = getClass().getResourceAsStream("/messages_es.properties")) {
                textos.load(new InputStreamReader(in, StandardCharsets.UTF_8));
            }
            for (Message.Msj clave : Message.Msj.values()) {
                assertThat(textos.getProperty(clave.name())).as(clave.name()).isNotBlank();
            }
            long sinClave = textos.stringPropertyNames().stream()
                    .filter(k -> !k.startsWith("validacion."))
                    .filter(k -> Stream.of(Message.Msj.values()).noneMatch(m -> m.name().equals(k)))
                    .count();
            assertThat(sinClave).isZero();
        }
    }
}
