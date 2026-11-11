package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.AnotacionDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.AnotacionService;
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
@RequestMapping("/v1/anotaciones")
@Tag(name = "Anotaciones", description = "Resaltados, notas y marcadores")
public class AnotacionController {

    private final AnotacionService anotaciones;

    public AnotacionController(AnotacionService anotaciones) {
        this.anotaciones = anotaciones;
    }

    @Operation(summary = "Anotaciones de un libro, en orden de creacion")
    @PostMapping(value = "/all/{ejemplarId}", produces = "application/json")
    public ResponseEntity<ResultDTO> all(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(anotaciones.getAll(ejemplarId)));
    }

    @Operation(summary = "Crea (sin id) o edita (con id) una anotacion")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody AnotacionDTO dto) {
        return ResponseEntity.ok(new ResultDTO(anotaciones.saveAndUpdate(dto)));
    }

    @Operation(summary = "Borra una anotacion")
    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable UUID id) {
        return ResponseEntity.ok(new ResultDTO(anotaciones.delete(id)));
    }
}
