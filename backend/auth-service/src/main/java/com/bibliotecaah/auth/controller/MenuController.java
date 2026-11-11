package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.MenuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * El menu de quien pregunta.
 *
 * No recibe ningun identificador, y eso es la mitad del diseno: no hay forma de
 * pedir "el menu de otro" porque no hay donde escribirlo. Los roles salen del
 * token.
 */
@RestController
@RequestMapping("/v1/menu")
@Tag(name = "Menu", description = "Los modulos y paginas que ve quien pregunta")
public class MenuController {

    private final MenuService menuService;

    public MenuController(MenuService menuService) {
        this.menuService = menuService;
    }

    @Operation(summary = "Modulos y paginas del usuario autenticado")
    @PostMapping(value = "/mine", produces = "application/json")
    public ResponseEntity<ResultDTO> miMenu() {
        return ResponseEntity.ok(menuService.miMenu());
    }
}
