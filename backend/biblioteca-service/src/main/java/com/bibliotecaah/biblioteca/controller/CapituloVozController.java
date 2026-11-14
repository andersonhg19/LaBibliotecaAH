package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.CapituloVozDTO;
import com.bibliotecaah.biblioteca.dto.input.SoloHistoriaDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.CapituloVozService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * (0.4.0, contrato C3) Que capitulos suenan en voz, por usuario y ejemplar. Van
 * por PUT porque asi lo fija el contrato compartido con la web (excepcion
 * documentada a la convencion POST). Solo el dueno del ejemplar: 102 si no.
 */
@RestController
@RequestMapping("/v1/ejemplares")
@Tag(name = "Capitulos en voz", description = "Elegir que capitulos lee la voz")
public class CapituloVozController {

    private final CapituloVozService capitulos;

    public CapituloVozController(CapituloVozService capitulos) {
        this.capitulos = capitulos;
    }

    @Operation(summary = "Un capitulo en voz o no ({\"enVoz\": true|false}; null = volver a lo de la estructura)")
    @PutMapping(value = "/{ejemplarId}/capitulos/{indice}/voz", produces = "application/json")
    public ResponseEntity<ResultDTO> cambiar(@PathVariable UUID ejemplarId, @PathVariable int indice,
                                             @RequestBody(required = false) CapituloVozDTO dto) {
        return ResponseEntity.ok(new ResultDTO(capitulos.cambiar(ejemplarId, indice, dto == null ? null : dto.getEnVoz())));
    }

    @Operation(summary = "Solo la historia en voz (true) o volver al defecto en todo el libro (false)")
    @PutMapping(value = "/{ejemplarId}/capitulos/voz", produces = "application/json")
    public ResponseEntity<ResultDTO> soloHistoria(@PathVariable UUID ejemplarId, @Valid @RequestBody SoloHistoriaDTO dto) {
        return ResponseEntity.ok(new ResultDTO(capitulos.soloHistoria(ejemplarId, dto.getSoloHistoria())));
    }
}
