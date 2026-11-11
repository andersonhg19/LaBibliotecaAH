package com.bibliotecaah.biblioteca.controller;

import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.input.DeseoDTO;
import com.bibliotecaah.biblioteca.dto.input.LibroSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.service.LibroService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/libros")
@Tag(name = "Libros", description = "Mi Biblioteca: subir, listar, filtrar, editar y borrar libros")
public class LibroController {

    private final LibroService libros;

    public LibroController(LibroService libros) {
        this.libros = libros;
    }

    /** Acepta el campo como "archivos" o "archivos[]" (asi lo mandan algunos navegadores). */
    @Operation(summary = "Sube uno o varios archivos (EPUB, PDF, DOCX, DOC, TXT; hasta 300 MB cada uno)")
    @PostMapping(value = "/subir", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = "application/json")
    public ResponseEntity<ResultDTO> subir(
            @RequestParam(name = "archivos", required = false) List<MultipartFile> archivos,
            @RequestParam(name = "archivos[]", required = false) List<MultipartFile> archivosCorchetes,
            @RequestParam(name = "tipo", required = false, defaultValue = "LIBRO") TipoEjemplar tipo,
            @Parameter(description = "\"Ya lo tengo\" (v1.3.2): id de un deseo propio que este archivo cumple. "
                    + "Un solo archivo; el ejemplar que llega hereda nota, etiquetas y estantes, y el deseo se borra.")
            @RequestParam(name = "deseoId", required = false) UUID deseoId) {
        List<MultipartFile> todos = new ArrayList<>();
        if (archivos != null) todos.addAll(archivos);
        if (archivosCorchetes != null) todos.addAll(archivosCorchetes);
        return ResponseEntity.ok(libros.subir(todos, tipo, deseoId));
    }

    @Operation(summary = "Agrega un libro a la lista de deseos (sin archivo)")
    @PostMapping(value = "/deseo", produces = "application/json")
    public ResponseEntity<ResultDTO> deseo(@Valid @RequestBody DeseoDTO dto) {
        return ResponseEntity.ok(new ResultDTO(libros.deseo(dto)));
    }

    @Operation(summary = "Lista paginada con pestanas, filtros combinables y orden")
    @PostMapping(value = "/all", produces = "application/json")
    public ResponseEntity<ResultDTO> all(@RequestBody(required = false) FiltroLibrosDTO filtro) {
        return ResponseEntity.ok(new ResultDTO(libros.getAll(filtro)));
    }

    @Operation(summary = "Ficha del libro con capitulos y progreso")
    @PostMapping(value = "/get/{ejemplarId}", produces = "application/json")
    public ResponseEntity<ResultDTO> get(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(libros.getById(ejemplarId)));
    }

    @Operation(summary = "Edita datos, estado, calificacion, etiquetas o favorito (lo nulo no se toca)")
    @PostMapping(value = "/save", produces = "application/json")
    public ResponseEntity<ResultDTO> save(@Valid @RequestBody LibroSaveDTO dto) {
        return ResponseEntity.ok(new ResultDTO(libros.saveAndUpdate(dto)));
    }

    @Operation(summary = "Borra el libro de tu biblioteca (el archivo solo si nadie mas lo usa)")
    @PostMapping(value = "/delete/{ejemplarId}", produces = "application/json")
    public ResponseEntity<ResultDTO> delete(@PathVariable UUID ejemplarId) {
        return ResponseEntity.ok(new ResultDTO(libros.delete(ejemplarId)));
    }

    @Operation(summary = "Valores para los filtros: autores, generos, anios, formatos y etiquetas con su cuenta",
            description = "Cuerpo opcional {pestana}: las cuentas son las de ESA pestana (por defecto TODO = solo "
                    + "libros, sin deseos ni documentos). Generos y etiquetas sin distinguir mayusculas.")
    @PostMapping(value = "/facetas", produces = "application/json")
    public ResponseEntity<ResultDTO> facetas(@RequestBody(required = false) FiltroLibrosDTO filtro) {
        return ResponseEntity.ok(new ResultDTO(libros.facetas(filtro == null ? null : filtro.getPestana())));
    }
}
