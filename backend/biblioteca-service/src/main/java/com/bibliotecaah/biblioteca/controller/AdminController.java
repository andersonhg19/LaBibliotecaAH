package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.MantenimientoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mantenimiento de la instalacion. Todo /v1/admin/** exige el rol ADMIN (SecurityConfig). */
@RestController
@RequestMapping("/v1/admin")
@Tag(name = "Administracion", description = "Requiere rol ADMIN")
public class AdminController {

    private final MantenimientoService mantenimiento;

    public AdminController(MantenimientoService mantenimiento) {
        this.mantenimiento = mantenimiento;
    }

    @Operation(summary = "Rellena los generos vacios releyendo las materias de los originales (idempotente)")
    @PostMapping(value = "/libros/rellenar-generos", produces = "application/json")
    public ResponseEntity<ResultDTO> rellenarGeneros() {
        return ResponseEntity.ok(new ResultDTO(mantenimiento.rellenarGeneros()));
    }
}
