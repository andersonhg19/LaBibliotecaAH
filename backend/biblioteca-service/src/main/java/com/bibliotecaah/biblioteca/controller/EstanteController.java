package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.EstanteEjemplarDTO;
import com.bibliotecaah.biblioteca.dto.input.EstanteSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.EstanteService;
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
@RequestMapping("/v1/estantes")
@Tag(name = "Estantes", description = "Colecciones y el estante de favoritos, con orden por arrastre")
public class EstanteController {

    private final EstanteService estantes;

    public EstanteController(EstanteService estantes) {
        this.estantes = estantes;
    }

    @Operation(summary = "Estantes del usuario (FAVORITOS primero; se crea solo)")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> all() {
        return ResponseEntity.ok(new ResultDTO(estantes.getAll()));
    }

    @Operation(summary = "Crea (sin id) o renombra/colorea (con id) un estante")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody EstanteSaveDTO dto) {
        return ResponseEntity.ok(new ResultDTO(estantes.saveAndUpdate(dto)));
    }

    @Operation(summary = "Borra un estante (los libros no se borran)")
    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable UUID id) {
        return ResponseEntity.ok(new ResultDTO(estantes.delete(id)));
    }

    @Operation(summary = "Libros del estante en su orden")
    @PostMapping(value = "/{id}/libros", produces = "application/json")
    public ResponseEntity<ResultDTO> libros(@PathVariable UUID id) {
        return ResponseEntity.ok(new ResultDTO(estantes.libros(id)));
    }

    @Operation(summary = "Pone un libro al final del estante")
    @PostMapping(value = "/{id}/agregar", produces = "application/json")
    public ResponseEntity<ResultDTO> agregar(@PathVariable UUID id, @Valid @RequestBody EstanteEjemplarDTO dto) {
        return ResponseEntity.ok(new ResultDTO(estantes.agregar(id, dto.getEjemplarId())));
    }

    @Operation(summary = "Quita un libro del estante")
    @PostMapping(value = "/{id}/quitar", produces = "application/json")
    public ResponseEntity<ResultDTO> quitar(@PathVariable UUID id, @Valid @RequestBody EstanteEjemplarDTO dto) {
        return ResponseEntity.ok(new ResultDTO(estantes.quitar(id, dto.getEjemplarId())));
    }

    @Operation(summary = "Mueve un libro antes o despues de otro (indice fraccional)")
    @PostMapping(value = "/{id}/ordenar", produces = "application/json")
    public ResponseEntity<ResultDTO> ordenar(@PathVariable UUID id, @Valid @RequestBody EstanteEjemplarDTO dto) {
        return ResponseEntity.ok(new ResultDTO(estantes.ordenar(id, dto)));
    }
}
