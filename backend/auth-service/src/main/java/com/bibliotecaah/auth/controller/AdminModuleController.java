package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.PermisoSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.AdminModuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/admin")
@Tag(name = "Administracion de modulos y permisos", description = "Requiere rol ADMIN")
public class AdminModuleController {

    private final AdminModuleService adminModuleService;

    public AdminModuleController(AdminModuleService adminModuleService) {
        this.adminModuleService = adminModuleService;
    }

    @Operation(summary = "Modulos con sus paginas, incluidos los desactivados")
    @PostMapping(value = "/modules/all", produces = "application/json")
    public ResponseEntity<ResultDTO> modulos() {
        return ResponseEntity.ok(adminModuleService.getModulos());
    }

    @Operation(summary = "Permisos de un rol, pagina a pagina")
    @PostMapping(value = "/permissions/{roleName}", produces = "application/json")
    public ResponseEntity<ResultDTO> permisosDeRol(@PathVariable String roleName) {
        return ResponseEntity.ok(adminModuleService.getPermisosDeRol(roleName));
    }

    @Operation(summary = "Fija lo que un rol puede hacer en una pagina")
    @PostMapping(value = "/permissions/save", produces = "application/json")
    public ResponseEntity<ResultDTO> guardarPermiso(@Valid @RequestBody PermisoSaveDTO dto) {
        return ResponseEntity.ok(adminModuleService.guardarPermiso(dto));
    }
}
