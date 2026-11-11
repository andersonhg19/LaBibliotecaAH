package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.AudioEstadoPeticionDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.AudioService;
import com.bibliotecaah.biblioteca.service.VozService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "Voces y audio", description = "Catalogo de voces y audio por capitulo")
public class VozController {

    private final VozService voces;
    private final AudioService audio;

    public VozController(VozService voces, AudioService audio) {
        this.voces = voces;
        this.audio = audio;
    }

    @Operation(summary = "Catalogo de voces (del taller, con respaldo si no responde)")
    @PostMapping(value = "/voces/all", produces = "application/json")
    public ResponseEntity<ResultDTO> voces() {
        return ResponseEntity.ok(new ResultDTO(voces.getAll()));
    }

    @Operation(summary = "Estado del audio de un capitulo; si falta lo encola (y los 2 siguientes)")
    @PostMapping(value = "/audio/estado", produces = "application/json")
    public ResponseEntity<ResultDTO> estado(@Valid @RequestBody AudioEstadoPeticionDTO dto) {
        return ResponseEntity.ok(new ResultDTO(audio.estado(dto)));
    }
}
