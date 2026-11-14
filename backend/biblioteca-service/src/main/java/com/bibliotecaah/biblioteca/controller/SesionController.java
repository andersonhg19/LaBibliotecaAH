package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.LatidoDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.SesionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * (0.4.0, contrato C4) Tiempo de lectura y escucha. El resumen va por GET con
 * fechas en la query (contrato compartido con la web; excepcion documentada a
 * la convencion POST, como los binarios).
 */
@RestController
@RequestMapping("/v1/sesiones")
@Tag(name = "Sesiones de lectura", description = "Minutos leidos y escuchados, por dia y en rachas")
public class SesionController {

    private final SesionService sesiones;

    public SesionController(SesionService sesiones) {
        this.sesiones = sesiones;
    }

    @Operation(summary = "Latido de una sesion de lectura o escucha (cada ~60 s y al pausar/salir)",
            description = "Crea la sesion (sin sesionId o con uno nuevo) o la alarga. segundos 0..120 desde el "
                    + "latido anterior; lo que suma no pasa del tiempo real desde el ultimo latido de cualquier "
                    + "sesion del usuario + 10 s; ejemplar ajeno -> 102; sesionId de otra persona u otro libro -> 102.")
    @PostMapping(value = "/latido", produces = "application/json")
    public ResponseEntity<ResultDTO> latido(@Valid @RequestBody LatidoDTO dto) {
        return ResponseEntity.ok(new ResultDTO(sesiones.latido(dto)));
    }

    @Operation(summary = "Resumen: minutos de lectura y voz, por dia y por libro, y rachas (zona America/Bogota)",
            description = "desde/hasta AAAA-MM-DD, opcionales (por defecto los ultimos 30 dias, como mucho 366).")
    @GetMapping(value = "/resumen", produces = "application/json")
    public ResponseEntity<ResultDTO> resumen(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return ResponseEntity.ok(new ResultDTO(sesiones.resumen(desde, hasta)));
    }
}
