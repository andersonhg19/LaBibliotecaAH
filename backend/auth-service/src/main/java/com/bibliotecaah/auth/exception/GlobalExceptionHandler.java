package com.bibliotecaah.auth.exception;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Objects;
import java.util.stream.Collectors;

/**
 * El contrato de errores deja de ser un acuerdo verbal.
 *
 * Toda la API habla ResultDTO con HTTP 200, y el frontend SOLO sabe leer eso.
 * Pero nadie lo imponia: un cuerpo vacio, un campo con el tipo cambiado o
 * cualquier excepcion sin capturar se escapaban como el 400/500 propio de
 * Spring, con su JSON de "timestamp/status/path". El frontend no lo entiende y
 * lo muestra como "Request failed with status code 400" —o, peor, como una
 * pantalla vacia sin una sola explicacion.
 *
 * Aqui se cierra ese agujero: pase lo que pase dentro de un controller, sale un
 * ResultDTO con HTTP 200 y un mensaje que dice QUE campo falla.
 *
 * Esta acotado al paquete de controllers a proposito: una ruta que no existe o
 * un recurso estatico que falta NO son errores de negocio y deben seguir siendo
 * 404 de verdad. Convertirlos en 200 esconderia URLs mal escritas.
 */
@Slf4j
@RestControllerAdvice(basePackages = "com.bibliotecaah.auth.controller")
public class GlobalExceptionHandler {

    /* Se reutiliza la convencion que ya usan los servicios: el errorCode imita
       al codigo HTTP que ya no se envia. */
    private static final int PETICION_INVALIDA = 400;
    private static final int SIN_PERMISO = 403;
    private static final int ERROR_INTERNO = 500;

    private static final int LARGO_MAXIMO_ECO = 40;

    /** Campos que no pasan las validaciones del DTO. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ResultDTO> datosInvalidos(MethodArgumentNotValidException ex) {
        String detalle = ex.getBindingResult().getFieldErrors().stream()
                .map(this::describir)
                .collect(Collectors.joining("; "));
        if (detalle.isEmpty()) {
            detalle = "la peticion no cumple las validaciones";
        }
        return respuesta("Revisa los datos enviados: " + detalle + ".", PETICION_INVALIDA);
    }

    /** Cuerpo ausente, JSON roto o un campo con un tipo que no corresponde. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ResultDTO> cuerpoIlegible(HttpMessageNotReadableException ex) {
        Throwable causa = ex.getCause();
        if (causa instanceof InvalidFormatException formato) {
            return respuesta("El campo '" + campo(formato) + "' no admite el valor enviado ("
                    + recorta(formato.getValue()) + ").", PETICION_INVALIDA);
        }
        if (causa instanceof MismatchedInputException tipo) {
            return respuesta("El campo '" + campo(tipo) + "' llego con un tipo que no corresponde.",
                    PETICION_INVALIDA);
        }
        return respuesta("El cuerpo de la peticion viene vacio o no es un JSON valido.",
                PETICION_INVALIDA);
    }

    /** Falta un parametro de la URL. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ResultDTO> faltaParametro(MissingServletRequestParameterException ex) {
        return respuesta("Falta el parametro obligatorio '" + ex.getParameterName() + "'.",
                PETICION_INVALIDA);
    }

    /** Un id de la ruta que no es un numero, por ejemplo /delete/abc. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ResultDTO> parametroConTipoIncorrecto(MethodArgumentTypeMismatchException ex) {
        return respuesta("El parametro '" + ex.getName() + "' no admite el valor enviado ("
                + recorta(ex.getValue()) + ").", PETICION_INVALIDA);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ResultDTO> sinPermiso(AccessDeniedException ex) {
        log.warn("Acceso denegado: {}", ex.getMessage());
        return respuesta("No tienes permiso para hacer esto.", SIN_PERMISO);
    }

    /** Red final: nada que reviente dentro de un controller sale del contrato. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ResultDTO> errorNoPrevisto(Exception ex) {
        log.error("Error no previsto atendiendo la peticion: {}", ex.getMessage(), ex);
        return respuesta("Ocurrio un error inesperado procesando la peticion. Intentalo de nuevo.",
                ERROR_INTERNO);
    }

    private String describir(FieldError error) {
        return "el campo '" + error.getField() + "' " + error.getDefaultMessage();
    }

    private String campo(MismatchedInputException ex) {
        String ruta = ex.getPath().stream()
                .map(JsonMappingException.Reference::getFieldName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining("."));
        return ruta.isEmpty() ? "cuerpo" : ruta;
    }

    /* El valor rechazado se devuelve para que se pueda ver el error, pero
       recortado: no tiene sentido reflejar un texto de 5.000 caracteres. */
    private String recorta(Object valor) {
        String texto = String.valueOf(valor);
        return texto.length() <= LARGO_MAXIMO_ECO ? texto : texto.substring(0, LARGO_MAXIMO_ECO) + "...";
    }

    private ResponseEntity<ResultDTO> respuesta(String mensaje, int codigo) {
        return ResponseEntity.ok(new ResultDTO(false, mensaje, codigo));
    }
}
