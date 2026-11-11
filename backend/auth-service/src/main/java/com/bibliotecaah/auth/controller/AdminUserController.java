package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.AsignarRolesDTO;
import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Administracion de cuentas.
 *
 * Todo lo que cuelga de /v1/admin exige el rol ADMIN, y la regla esta en el
 * SecurityConfig de este servicio —una sola vez, sobre el prefijo entero— en
 * lugar de repetida en cada metodo. Un endpoint nuevo aqui nace protegido; si
 * la comprobacion fuera por metodo, nacería abierto.
 */
@RestController
@RequestMapping("/v1/admin/users")
@Tag(name = "Administracion de usuarios", description = "Requiere rol ADMIN")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @Operation(summary = "Listado de cuentas, incluidas las desactivadas")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> getAll(@Valid @RequestBody UserFilterDTO filter) {
        return ResponseEntity.ok(adminUserService.getAll(filter));
    }

    @Operation(summary = "Ficha de una cuenta con sus roles")
    @PostMapping(value = "/get/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.getById(id));
    }

    @Operation(summary = "Alta de una cuenta desde administracion")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> crear(@Valid @RequestBody UserSaveDTO dto) {
        return ResponseEntity.ok(adminUserService.crear(dto));
    }

    @Operation(summary = "Fija los roles de una cuenta (lista completa, no incremental)")
    @PostMapping(value = "/{id}/roles", produces = "application/json")
    public ResponseEntity<ResultDTO> asignarRoles(@PathVariable Long id,
                                                  @Valid @RequestBody AsignarRolesDTO dto) {
        return ResponseEntity.ok(adminUserService.asignarRoles(id, dto));
    }

    @Operation(summary = "Reactiva una cuenta desactivada")
    @PostMapping(value = "/{id}/activate", produces = "application/json")
    public ResponseEntity<ResultDTO> activar(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.cambiarActivacion(id, true));
    }

    @Operation(summary = "Desactiva una cuenta")
    @PostMapping(value = "/{id}/deactivate", produces = "application/json")
    public ResponseEntity<ResultDTO> desactivar(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.cambiarActivacion(id, false));
    }
}
