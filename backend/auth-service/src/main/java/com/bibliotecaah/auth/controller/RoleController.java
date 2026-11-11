package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.RoleSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.RoleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/admin/roles")
@Tag(name = "Administracion de roles", description = "Requiere rol ADMIN")
public class RoleController {

    private final RoleService roleService;

    public RoleController(RoleService roleService) {
        this.roleService = roleService;
    }

    @Operation(summary = "Roles existentes, con cuantas cuentas activas lleva cada uno")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> getAll() {
        return ResponseEntity.ok(roleService.getAll());
    }

    @Operation(summary = "Crea o actualiza un rol")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody RoleSaveDTO dto) {
        return ResponseEntity.ok(roleService.saveAndUpdate(dto));
    }

    @Operation(summary = "Desactiva un rol que no use nadie")
    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> desactivar(@PathVariable Long id) {
        return ResponseEntity.ok(roleService.desactivar(id));
    }
}
