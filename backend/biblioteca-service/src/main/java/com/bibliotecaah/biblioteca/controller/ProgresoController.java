package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.ProgresoDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.ProgresoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/progreso")
@Tag(name = "Progreso", description = "Retomar exactamente donde lo dejaste, en cualquier dispositivo")
public class ProgresoController {

    private final ProgresoService progreso;

    public ProgresoController(ProgresoService progreso) {
        this.progreso = progreso;
    }

    @Operation(summary = "Progreso guardado de un libro (object nulo si nunca se abrio)")
    @PostMapping(value = "/get/{ejemplarId}", produces = "application/json")
    public ResponseEntity<ResultDTO> get(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(progreso.getById(ejemplarId)));
    }

    @Operation(summary = "Guarda el progreso; gana el actualizadoEn mas reciente")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody ProgresoDTO dto) {
        return ResponseEntity.ok(progreso.saveAndUpdate(dto));
    }
}
