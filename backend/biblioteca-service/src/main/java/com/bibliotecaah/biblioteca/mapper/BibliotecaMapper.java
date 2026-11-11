package com.bibliotecaah.biblioteca.mapper;

import com.bibliotecaah.biblioteca.dto.input.AnotacionDTO;
import com.bibliotecaah.biblioteca.dto.input.ComentarioDTO;
import com.bibliotecaah.biblioteca.dto.input.ProgresoDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDetalleDTO;
import com.bibliotecaah.biblioteca.entity.Anotacion;
import com.bibliotecaah.biblioteca.entity.Comentario;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Progreso;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.ReportingPolicy;

/**
 * Entidad <-> DTO con MapStruct (estandares §19). Los campos que no viven en la
 * entidad (favorito, porcentaje, nNotas, capitulos, progreso) los pone el
 * servicio despues; la auditoria (creation, lastUpdate, idModifiedBy) no sale,
 * salvo "creado" de anotaciones y comentarios, que el contrato pide.
 */
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface BibliotecaMapper {

    @Mapping(target = "archivoId", source = "archivo.id")
    @Mapping(target = "titulo", source = "obra.titulo")
    @Mapping(target = "subtitulo", source = "obra.subtitulo")
    @Mapping(target = "autores", source = "obra.autores")
    @Mapping(target = "anio", source = "obra.anio")
    @Mapping(target = "editorial", source = "obra.editorial")
    @Mapping(target = "idioma", source = "obra.idioma")
    @Mapping(target = "isbn", source = "obra.isbn")
    @Mapping(target = "sinopsis", source = "obra.sinopsis")
    @Mapping(target = "generos", source = "obra.generos")
    @Mapping(target = "fuenteMetadatos", source = "obra.fuenteMetadatos")
    @Mapping(target = "formatoOriginal", source = "archivo.formatoOriginal")
    @Mapping(target = "estadoConversion", source = "archivo.estadoConversion")
    @Mapping(target = "tienePortada", source = "archivo.tienePortada", defaultValue = "false")
    @Mapping(target = "minutosEstimados", source = "archivo.minutosEstimados")
    @Mapping(target = "favorito", ignore = true)
    @Mapping(target = "porcentaje", ignore = true)
    EjemplarDTO aEjemplarDTO(Ejemplar ejemplar);

    @Mapping(target = "archivoId", source = "archivo.id")
    @Mapping(target = "titulo", source = "obra.titulo")
    @Mapping(target = "subtitulo", source = "obra.subtitulo")
    @Mapping(target = "autores", source = "obra.autores")
    @Mapping(target = "anio", source = "obra.anio")
    @Mapping(target = "editorial", source = "obra.editorial")
    @Mapping(target = "idioma", source = "obra.idioma")
    @Mapping(target = "isbn", source = "obra.isbn")
    @Mapping(target = "sinopsis", source = "obra.sinopsis")
    @Mapping(target = "generos", source = "obra.generos")
    @Mapping(target = "fuenteMetadatos", source = "obra.fuenteMetadatos")
    @Mapping(target = "formatoOriginal", source = "archivo.formatoOriginal")
    @Mapping(target = "estadoConversion", source = "archivo.estadoConversion")
    @Mapping(target = "tienePortada", source = "archivo.tienePortada", defaultValue = "false")
    @Mapping(target = "minutosEstimados", source = "archivo.minutosEstimados")
    @Mapping(target = "favorito", ignore = true)
    @Mapping(target = "porcentaje", ignore = true)
    @Mapping(target = "capitulos", ignore = true)
    @Mapping(target = "progreso", ignore = true)
    EjemplarDetalleDTO aDetalleDTO(Ejemplar ejemplar);

    ProgresoDTO aProgresoDTO(Progreso progreso);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "usuarioId", ignore = true)
    @Mapping(target = "ejemplarId", ignore = true)
    void copiarProgreso(ProgresoDTO dto, @MappingTarget Progreso progreso);

    @Mapping(target = "creado", source = "creation")
    AnotacionDTO aAnotacionDTO(Anotacion anotacion);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "usuarioId", ignore = true)
    @Mapping(target = "ejemplarId", ignore = true)
    @Mapping(target = "editado", ignore = true)
    void copiarAnotacion(AnotacionDTO dto, @MappingTarget Anotacion anotacion);

    @Mapping(target = "creado", source = "creation")
    ComentarioDTO aComentarioDTO(Comentario comentario);
}
