package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.TraducirCapituloDTO;
import com.bibliotecaah.biblioteca.dto.input.TraducirDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.TraduccionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/traducir")
@Tag(name = "Traduccion", description = "Traduccion autoalojada (los libros no salen de casa)")
public class TraduccionController {

    private final TraduccionService traducciones;

    public TraduccionController(TraduccionService traducciones) {
        this.traducciones = traducciones;
    }

    @Operation(summary = "Traduce un texto de 1 a 5000 caracteres (origen en|auto, destino es); "
            + "503 si el traductor no responde, 429 si se traduce demasiado en poco tiempo")
    @PostMapping(produces = "application/json")
    public ResponseEntity<ResultDTO> traducir(@Valid @RequestBody TraducirDTO dto) {
        return ResponseEntity.ok(new ResultDTO(traducciones.traducir(dto)));
    }

    @Operation(summary = "Capitulo traducido frase a frase con sus ids: LISTO con las frases, o PENDIENTE "
            + "(se esta traduciendo: volver a preguntar) o ERROR con el motivo")
    @PostMapping(value = "/capitulo", produces = "application/json")
    public ResponseEntity<ResultDTO> capitulo(@Valid @RequestBody TraducirCapituloDTO dto) {
        return ResponseEntity.ok(new ResultDTO(traducciones.capitulo(dto)));
    }
}
