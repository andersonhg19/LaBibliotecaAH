package com.bibliotecaah.biblioteca.exception;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import lombok.extern.slf4j.Slf4j;
import com.bibliotecaah.biblioteca.config.Topes;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

import java.util.Objects;
import java.util.stream.Collectors;

/** Todo error de la API vuelve como ResultDTO con HTTP 200 (convencion de la casa). */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final int LARGO_MAXIMO_ECO = 40;

    private final Mensajes mensajes;
    private final Topes topes;

    public GlobalExceptionHandler(Mensajes mensajes, Topes topes) {
        this.mensajes = mensajes;
        this.topes = topes;
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ResultDTO> validacion(ValidationException ex) {
        if (ex instanceof DatosNoDisponiblesException) {
            log.error("La carpeta de datos no esta disponible");
        } else {
            log.info("Peticion rechazada: {} ({})", ex.getClave(), ex.getCodigo());
        }
        return respuesta(ex.getCodigo(), ex.getClave(), ex.getArgumentos());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ResultDTO> datosInvalidos(MethodArgumentNotValidException ex) {
        String detalle = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + " " + e.getDefaultMessage())
                .sorted()
                .collect(Collectors.joining("; "));
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.datosInvalidos, detalle);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ResultDTO> cuerpoIlegible(HttpMessageNotReadableException ex) {
        Throwable causa = ex.getCause();
        if (causa instanceof InvalidFormatException formato) {
            return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.campoValorInvalido,
                    campo(formato), recorta(formato.getValue()));
        }
        if (causa instanceof MismatchedInputException tipo) {
            return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.campoTipoInvalido, campo(tipo));
        }
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.cuerpoInvalido);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ResultDTO> faltaParametro(MissingServletRequestParameterException ex) {
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.parametroFaltante, ex.getParameterName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ResultDTO> parametroConTipoIncorrecto(MethodArgumentTypeMismatchException ex) {
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.parametroInvalido, ex.getName(), recorta(ex.getValue()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ResultDTO> demasiadoGrande(MaxUploadSizeExceededException ex) {
        log.warn("Subida demasiado grande: {}", ex.getMessage());
        return respuesta(CodigoError.DEMASIADO_GRANDE, Message.Msj.archivoDemasiadoGrande,
                Topes.legible(topes.getMaxArchivo()), Topes.legible(topes.getMaxSubida()));
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ResultDTO> subidaRota(MultipartException ex) {
        log.warn("Subida multipart invalida: {}", ex.getMessage());
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.subidaIncompleta);
    }

    /**
     * Dos peticiones iguales a la vez (doble clic, reintento de red) que chocan
     * en una restriccion unica (QA BI-09, DA-13): nunca un "error inesperado".
     * Las operaciones idempotentes ya lo evitan; esto es la red de seguridad.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ResultDTO> conflicto(DataIntegrityViolationException ex) {
        log.warn("Conflicto de concurrencia en la base: {}", ex.getMostSpecificCause().getMessage());
        return respuesta(CodigoError.DUPLICADO, Message.Msj.conflictoConcurrente);
    }

    /** QA SE-16: cuerpo XML u otro tipo: 120 con mensaje, no 103 con stacktrace. */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ResultDTO> tipoDeContenido(HttpMediaTypeNotSupportedException ex) {
        return respuesta(CodigoError.DATO_INVALIDO, Message.Msj.contenidoNoSoportado);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ResultDTO> errorNoPrevisto(Exception ex) {
        log.error("Error no previsto atendiendo la peticion: {}", ex.getMessage(), ex);
        return respuesta(CodigoError.ERROR_DE_PROCESO, Message.Msj.errorInesperado);
    }

    private String campo(MismatchedInputException ex) {
        String ruta = ex.getPath().stream()
                .map(JsonMappingException.Reference::getFieldName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining("."));
        return ruta.isEmpty() ? "cuerpo" : ruta;
    }

    private static String recorta(Object valor) {
        String texto = String.valueOf(valor);
        return texto.length() <= LARGO_MAXIMO_ECO ? texto : texto.substring(0, LARGO_MAXIMO_ECO) + "...";
    }

    private ResponseEntity<ResultDTO> respuesta(int codigo, Message.Msj clave, Object... argumentos) {
        return ResponseEntity.ok(new ResultDTO(false, mensajes.texto(clave, argumentos), codigo));
    }
}
