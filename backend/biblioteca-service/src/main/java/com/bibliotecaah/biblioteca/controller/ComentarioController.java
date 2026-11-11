package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.ComentarioDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.ComentarioService;
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
@RequestMapping("/v1/comentarios")
@Tag(name = "Comentarios", description = "Diario de lectura de cada libro")
public class ComentarioController {

    private final ComentarioService comentarios;

    public ComentarioController(ComentarioService comentarios) {
        this.comentarios = comentarios;
    }

    @Operation(summary = "Comentarios de un libro, en orden de creacion")
    @PostMapping(value = "/all/{ejemplarId}", produces = "application/json")
    public ResponseEntity<ResultDTO> all(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(comentarios.getAll(ejemplarId)));
    }

    @Operation(summary = "Crea (sin id) o edita (con id) un comentario")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody ComentarioDTO dto) {
        return ResponseEntity.ok(new ResultDTO(comentarios.saveAndUpdate(dto)));
    }

    @Operation(summary = "Borra un comentario")
    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable UUID id) {
        return ResponseEntity.ok(new ResultDTO(comentarios.delete(id)));
    }
}
