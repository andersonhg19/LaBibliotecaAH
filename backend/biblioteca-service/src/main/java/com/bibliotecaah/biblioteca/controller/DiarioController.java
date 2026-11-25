package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.input.DiarioDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.DiarioService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** (0.5.0, contrato C9) Diario del reproductor: telemetria propia, nunca sale de casa. */
@RestController
@RequestMapping("/v1/diario")
@Tag(name = "Diario del reproductor", description = "Eventos del reproductor de la web (atascos, pausas, errores)")
public class DiarioController {

    private final DiarioService diario;

    public DiarioController(DiarioService diario) {
        this.diario = diario;
    }

    @Operation(summary = "Guarda un lote de 1 a 50 eventos del reproductor",
            description = "Usuario = el del token. tipo [a-z0-9-] de hasta 40; detalle hasta 500; contexto objeto "
                    + "plano de hasta 2 KB con ua de hasta 200; fuera de limites -> 120 y no se guarda nada. "
                    + "ejemplarId ajeno o inexistente se guarda como null. Como mucho 600 eventos por usuario y hora: "
                    + "los de mas se descartan en silencio y object.guardados dice cuantos se guardaron.")
    @PostMapping(produces = "application/json")
    public ResponseEntity<ResultDTO> guardar(@Valid @RequestBody DiarioDTO dto) {
        return ResponseEntity.ok(new ResultDTO(diario.guardar(dto)));
    }
}
