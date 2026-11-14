package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.impl.EstadoDeLaCasa;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** (0.4.0, contrato C6) Estado de la casa para la lampara de la web. Con sesion; GET por contrato. */
@RestController
@RequestMapping("/v1")
@Tag(name = "Estado de la casa", description = "Taller, traductor, disco y cola de voz")
public class EstadoCasaController {

    private final EstadoDeLaCasa casa;

    public EstadoCasaController(EstadoDeLaCasa casa) {
        this.casa = casa;
    }

    @Operation(summary = "Como esta la casa: taller OK|LENTO|CAIDO, traductor OK|CAIDO, disco OK|DESCONECTADO, "
            + "colaVoz y un mensaje para la persona (cache de 15 s)")
    @GetMapping(value = "/estado-casa", produces = "application/json")
    public ResponseEntity<ResultDTO> estado() {
        return ResponseEntity.ok(new ResultDTO(casa.estado()));
    }
}
