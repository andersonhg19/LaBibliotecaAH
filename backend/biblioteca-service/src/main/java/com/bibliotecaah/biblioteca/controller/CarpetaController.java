package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.filter.FiltroCarpetaDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaBorrarDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaMoverDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaSaveDTO;
import com.bibliotecaah.biblioteca.dto.input.MoverDocumentosDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.service.CarpetaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** (v1.6) El archivador de documentos: carpetas, subcarpetas y mover documentos. */
@RestController
@RequestMapping("/v1/carpetas")
@Tag(name = "Carpetas", description = "Archivador de documentos: carpetas y subcarpetas de cada usuario")
public class CarpetaController {

    private final CarpetaService carpetas;

    public CarpetaController(CarpetaService carpetas) {
        this.carpetas = carpetas;
    }

    @Operation(summary = "Todas tus carpetas (en profundidad, hermanas por nombre) con sus cuentas")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> all() {
        return ResponseEntity.ok(new ResultDTO(carpetas.getAll()));
    }

    @Operation(summary = "Lo que hay en una carpeta (carpetaId null = raiz): migas, subcarpetas y documentos",
            description = "Con texto busca en la carpeta y en todas sus subcarpetas (sin mayusculas ni tildes). "
                    + "Orden: NOMBRE (por defecto), RECIENTES o ANTIGUOS.")
    @PostMapping(value = "/contenido", produces = "application/json")
    public ResponseEntity<ResultDTO> contenido(@Valid @RequestBody(required = false) FiltroCarpetaDTO filtro) {
        return ResponseEntity.ok(new ResultDTO(carpetas.contenido(filtro)));
    }

    @Operation(summary = "Crea (sin id, dentro de padreId o en la raiz) o renombra (con id) una carpeta")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody CarpetaSaveDTO dto) {
        return ResponseEntity.ok(new ResultDTO(carpetas.saveAndUpdate(dto)));
    }

    @Operation(summary = "Mueve una carpeta con todo lo suyo dentro de otra (destinoId null = a la raiz)")
    @PostMapping(value = "/mover", produces = "application/json")
    public ResponseEntity<ResultDTO> mover(@Valid @RequestBody CarpetaMoverDTO dto) {
        return ResponseEntity.ok(new ResultDTO(carpetas.mover(dto)));
    }

    @Operation(summary = "Mueve uno o varios documentos (hasta 200) a una carpeta (carpetaId null = a la raiz)")
    @PostMapping(value = "/mover-documentos", produces = "application/json")
    public ResponseEntity<ResultDTO> moverDocumentos(@Valid @RequestBody MoverDocumentosDTO dto) {
        return ResponseEntity.ok(new ResultDTO(carpetas.moverDocumentos(dto)));
    }

    @Operation(summary = "Borra una carpeta",
            description = "Vacia: sin cuerpo. Con algo dentro hay que elegir {contenido: SUBIR} (todo pasa a la "
                    + "carpeta de arriba) o {contenido: BORRAR} (subcarpetas fuera y documentos retirados).")
    @PostMapping(value = "/delete/{id}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable UUID id,
                                            @RequestBody(required = false) CarpetaBorrarDTO dto) {
        return ResponseEntity.ok(new ResultDTO(carpetas.delete(id, dto)));
    }
}
