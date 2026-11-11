package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.AppConfigSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.PreferenciasService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Las preferencias de quien pregunta. No recibe ningun identificador: salen
 * del token, igual que el menu.
 */
@RestController
@RequestMapping("/v1")
@Tag(name = "Preferencias", description = "Ajustes de la instalacion")
public class PreferenciasController {

    private final PreferenciasService preferenciasService;

    public PreferenciasController(PreferenciasService preferenciasService) {
        this.preferenciasService = preferenciasService;
    }

    @Operation(summary = "Nombre de la app e idioma regional de la instalacion")
    @PostMapping(value = "/preferences/mine", produces = "application/json")
    public ResponseEntity<ResultDTO> mias() {
        return ResponseEntity.ok(preferenciasService.misPreferencias());
    }

    @Operation(summary = "Ajustes de la instalacion. Requiere rol ADMIN")
    @PostMapping(value = "/admin/config/all", produces = "application/json")
    public ResponseEntity<ResultDTO> configuracion() {
        return ResponseEntity.ok(preferenciasService.getConfiguracion());
    }

    @Operation(summary = "Cambia un ajuste de la instalacion. Requiere rol ADMIN")
    @PostMapping(value = "/admin/config/save", produces = "application/json")
    public ResponseEntity<ResultDTO> guardar(@Valid @RequestBody AppConfigSaveDTO dto) {
        return ResponseEntity.ok(preferenciasService.guardarConfiguracion(dto));
    }
}
