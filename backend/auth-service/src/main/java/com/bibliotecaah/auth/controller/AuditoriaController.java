package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.AuditoriaFilterDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.AuditoriaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cuelga de /v1/admin, asi que la regla del SecurityConfig ya lo cierra bajo
 * el rol ADMIN. Y solo lee: no hay forma de escribir ni de borrar una linea
 * desde la API.
 */
@RestController
@RequestMapping("/v1/admin/audit")
@Tag(name = "Auditoria", description = "Requiere rol ADMIN. Solo lectura")
public class AuditoriaController {

    private final AuditoriaService auditoriaService;

    public AuditoriaController(AuditoriaService auditoriaService) {
        this.auditoriaService = auditoriaService;
    }

    @Operation(summary = "Quien cambio que y cuando")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> consultar(@Valid @RequestBody AuditoriaFilterDTO filtro) {
        return ResponseEntity.ok(auditoriaService.consultar(filtro));
    }
}
