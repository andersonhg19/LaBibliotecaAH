package com.bibliotecaah.auth.controller;

import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody UserSaveDTO dto) {
        return ResponseEntity.ok(userService.saveAndUpdate(dto));
    }

    @PostMapping(value = "/get/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.getById(id));
    }

    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> getAll(@Valid @RequestBody UserFilterDTO filter) {
        return ResponseEntity.ok(userService.getAll(filter));
    }

    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable Long id) {
        return ResponseEntity.ok(userService.delete(id));
    }
}
