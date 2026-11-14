package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.PronunciacionEntradaDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.PronunciacionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * (B17) Diccionario de pronunciacion del libro. GET/PUT como las rutas de
 * capitulos en voz del contrato 0.4.0 (excepcion documentada a la convencion
 * POST). Solo el dueno del ejemplar: 102 si no.
 */
@RestController
@RequestMapping("/v1/ejemplares")
@Tag(name = "Pronunciacion", description = "Como dice la voz las palabras de un libro")
public class PronunciacionController {

    private final PronunciacionService pronunciacion;

    public PronunciacionController(PronunciacionService pronunciacion) {
        this.pronunciacion = pronunciacion;
    }

    @Operation(summary = "Diccionario de pronunciacion del libro ({entradas: [{de, a}], regenerando})")
    @GetMapping(value = "/{ejemplarId}/pronunciacion", produces = "application/json")
    public ResponseEntity<ResultDTO> ver(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(pronunciacion.ver(ejemplarId)));
    }

    @Operation(summary = "Sustituye el diccionario entero ([{\"de\": \"Hermione\", \"a\": \"Jermáyoni\"}], hasta 200; [] = vaciar)"
            + " y regenera los capitulos ya listos que contienen alguna palabra cambiada")
    @PutMapping(value = "/{ejemplarId}/pronunciacion", produces = "application/json")
    public ResponseEntity<ResultDTO> guardar(@PathVariable UUID ejemplarId,
                                             @RequestBody(required = false) List<PronunciacionEntradaDTO> entradas) {
        return ResponseEntity.ok(new ResultDTO(pronunciacion.guardar(ejemplarId, entradas)));
    }
}
