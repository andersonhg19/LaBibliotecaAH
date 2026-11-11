package com.bibliotecaah.biblioteca.config;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.catalina.Context;
import org.apache.catalina.Host;
import org.apache.catalina.connector.Request;
import org.apache.catalina.connector.Response;
import org.apache.catalina.valves.ErrorReportValve;
import org.apache.coyote.ActionCode;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Lo que Tomcat responde por su cuenta, antes o fuera de Spring MVC.
 *
 * <ul>
 *   <li><b>QA RG-02</b>: si una subida pasa del tope por archivo, Tomcat dejaba de leer el cuerpo
 *       ("aborted upload") y cerraba la conexion; el gateway, que seguia recibiendo del cliente, acumulaba
 *       el resto en memoria directa hasta agotarla. Con {@code swallowAbortedUploads} Tomcat descarta el
 *       resto del cuerpo en streaming (lee y tira, sin disco ni memoria: solo su bufer de socket) hasta
 *       {@code server.tomcat.max-swallow-size} (= tope por peticion), responde el 413 ResultDTO y la
 *       conexion sigue viva.</li>
 *   <li><b>QA SE-16 a</b>: una ruta que Tomcat rechaza antes de llegar a Spring (p. ej. {@code %2f}) daba
 *       su pagina HTML de error. Ahora el informe de error del host es un ResultDTO en JSON, sin HTML,
 *       sin version del servidor y sin trazas.</li>
 * </ul>
 */
@Slf4j
@Configuration
public class TomcatConfig {

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatDeLaBiblioteca(Mensajes mensajes,
                                                                                  ObjectMapper json) {
        ErrorJsonValve valvula = new ErrorJsonValve(
                json(json, Message.Msj.rutaInvalida, CodigoError.DATO_INVALIDO, mensajes),
                json(json, Message.Msj.rutaNoEncontrada, CodigoError.NO_ENCONTRADO, mensajes),
                json(json, Message.Msj.errorInesperado, CodigoError.ERROR_DE_PROCESO, mensajes));
        return fabrica -> fabrica.addContextCustomizers(contexto -> configurar(contexto, valvula));
    }

    static void configurar(Context contexto, ErrorJsonValve valvula) {
        contexto.setSwallowAbortedUploads(true);
        if (contexto.getParent() instanceof org.apache.catalina.core.StandardHost host) {
            // El host solo crea su ErrorReportValve si no hay ya una de la clase indicada.
            host.setErrorReportValveClass(ErrorJsonValve.class.getName());
            agregarSiFalta(host, valvula);
        }
    }

    private static void agregarSiFalta(Host host, ErrorJsonValve valvula) {
        for (var v : host.getPipeline().getValves()) {
            if (v instanceof ErrorJsonValve) return;
        }
        host.getPipeline().addValve(valvula);
    }

    private static String json(ObjectMapper json, Message.Msj clave, int codigo, Mensajes mensajes) {
        try {
            return json.writeValueAsString(new ResultDTO(false, mensajes.texto(clave), codigo));
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Informe de error de Tomcat como ResultDTO (400 → 120, 404 → 102, el resto → 103). */
    public static class ErrorJsonValve extends ErrorReportValve {

        private final String peticionInvalida;
        private final String noEncontrado;
        private final String inesperado;

        /** Tomcat la instancia por nombre si no encuentra la nuestra: textos neutros sin MessageSource. */
        public ErrorJsonValve() {
            this("{\"correct\":false,\"message\":\"Bad Request\",\"errorCode\":120,\"object\":null}",
                    "{\"correct\":false,\"message\":\"Not Found\",\"errorCode\":102,\"object\":null}",
                    "{\"correct\":false,\"message\":\"Error\",\"errorCode\":103,\"object\":null}");
        }

        ErrorJsonValve(String peticionInvalida, String noEncontrado, String inesperado) {
            this.peticionInvalida = peticionInvalida;
            this.noEncontrado = noEncontrado;
            this.inesperado = inesperado;
            setShowReport(false);
            setShowServerInfo(false);
        }

        public String cuerpo(int estado) {
            if (estado == 404) return noEncontrado;
            return estado < 500 ? peticionInvalida : inesperado;
        }

        @Override
        protected void report(Request request, Response response, Throwable throwable) {
            int estado = response.getStatus();
            // Igual que ErrorReportValve: si ya hay cuerpo (lo escribio Spring) o no es un error, no se toca.
            if (estado < 400 || response.getContentWritten() > 0 || !response.setErrorReported()) return;
            AtomicBoolean esPosible = new AtomicBoolean(false);
            response.getCoyoteResponse().action(ActionCode.IS_IO_ALLOWED, esPosible);
            if (!esPosible.get()) return;
            if (throwable != null) {
                log.error("Error de Tomcat fuera de Spring ({}): {}", estado, throwable.getMessage(), throwable);
            } else {
                log.info("Tomcat rechazo {} {} con {}", request.getMethod(), request.getRequestURI(), estado);
            }
            try {
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                Writer escritor = response.getReporter();
                if (escritor != null) {
                    escritor.write(cuerpo(estado));
                    response.finishResponse();
                }
            } catch (IOException | IllegalStateException e) {
                log.warn("No se pudo escribir el error JSON de Tomcat: {}", e.getMessage());
            }
        }
    }
}
