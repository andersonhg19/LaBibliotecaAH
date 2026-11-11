package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.input.DeseoDTO;
import com.bibliotecaah.biblioteca.dto.input.LibroSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDetalleDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;
import com.bibliotecaah.biblioteca.dto.output.PageDTO;
import com.bibliotecaah.biblioteca.dto.output.ResultDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Obra;
import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.mapper.BibliotecaMapper;
import com.bibliotecaah.biblioteca.repository.ArchivoRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarCustomRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.ObraRepository;
import com.bibliotecaah.biblioteca.repository.ProgresoRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.EstanteService;
import com.bibliotecaah.biblioteca.service.IngestaService;
import com.bibliotecaah.biblioteca.service.LibroService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
public class LibroServiceImpl implements LibroService {

    static final int TAMANO_POR_DEFECTO = 30;
    static final int TAMANO_MAXIMO = 200;

    private final EjemplarRepository ejemplares;
    private final ObraRepository obras;
    private final ArchivoRepository archivos;
    private final ProgresoRepository progresos;
    private final TrabajoRepository trabajos;
    private final IngestaService ingesta;
    private final EstanteService estantes;
    private final EnsambladorDeEjemplares ensamblador;
    private final LectorDeEstructura estructura;
    private final BibliotecaMapper mapper;
    private final AlmacenDeArchivos almacen;
    private final Mensajes mensajes;
    private final ApplicationEventPublisher eventos;

    public LibroServiceImpl(EjemplarRepository ejemplares, ObraRepository obras, ArchivoRepository archivos,
                            ProgresoRepository progresos, TrabajoRepository trabajos, IngestaService ingesta,
                            EstanteService estantes, EnsambladorDeEjemplares ensamblador,
                            LectorDeEstructura estructura, BibliotecaMapper mapper, AlmacenDeArchivos almacen,
                            Mensajes mensajes, ApplicationEventPublisher eventos) {
        this.ejemplares = ejemplares;
        this.obras = obras;
        this.archivos = archivos;
        this.progresos = progresos;
        this.trabajos = trabajos;
        this.ingesta = ingesta;
        this.estantes = estantes;
        this.ensamblador = ensamblador;
        this.estructura = estructura;
        this.mapper = mapper;
        this.almacen = almacen;
        this.mensajes = mensajes;
        this.eventos = eventos;
    }

    // ------------------------------------------------------------------ subir

    @Override
    public ResultDTO subir(List<MultipartFile> ficheros, TipoEjemplar tipo) {
        Long yo = SecurityUtils.usuarioActual();
        List<MultipartFile> validos = ficheros == null ? List.of()
                : ficheros.stream().filter(f -> f != null && !f.isEmpty()).toList();
        ValidationUtils.exigir(!validos.isEmpty(), Message.Msj.sinArchivos, CodigoError.DATO_INVALIDO);
        almacen.exigirDisponible();

        List<EjemplarDTO> aceptados = new ArrayList<>();
        List<String> rechazos = new ArrayList<>();
        for (MultipartFile f : validos) {
            try (InputStream in = f.getInputStream()) {
                IngestaService.Resultado r = ingesta.ingerir(yo, f.getOriginalFilename(), in, tipo);
                if (r.aceptado()) aceptados.add(r.ejemplar());
                else rechazos.add(r.rechazo());
            } catch (IOException e) {
                log.error("Fallo leyendo la subida {}: {}", f.getOriginalFilename(), e.getMessage(), e);
                rechazos.add(mensajes.texto(Message.Msj.subidaIncompleta) + " (" + f.getOriginalFilename() + ")");
            }
        }
        if (aceptados.isEmpty()) {
            return new ResultDTO(false, mensajes.texto(Message.Msj.ningunArchivoAceptado, String.join(" ", rechazos)),
                    CodigoError.DATO_INVALIDO, aceptados);
        }
        String mensaje = rechazos.isEmpty() ? "OK"
                : mensajes.texto(Message.Msj.algunosRechazados, aceptados.size(), String.join(" ", rechazos));
        return new ResultDTO(true, mensaje, CodigoError.OK, aceptados);
    }

    // ------------------------------------------------------------------ deseo

    @Override
    @Transactional
    public EjemplarDTO deseo(DeseoDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        List<String> autores = new ArrayList<>();
        if (dto.getAutor() != null && !dto.getAutor().isBlank()) autores.add(dto.getAutor().trim());
        Obra obra = obras.save(Obra.builder()
                .id(UUID.randomUUID())
                .titulo(dto.getTitulo().trim())
                .autores(autores)
                .generos(new ArrayList<>())
                .isbn(vacioComoNulo(dto.getIsbn()))
                .fuenteMetadatos(FuenteMetadatos.MANUAL)
                .build());
        Ejemplar e = ejemplares.save(Ejemplar.builder()
                .id(UUID.randomUUID())
                .usuarioId(yo)
                .obra(obra)
                .tipo(TipoEjemplar.DESEO)
                .estado(EstadoLectura.POR_LEER)
                .fechaLlegada(Instant.now())
                .etiquetas(new ArrayList<>())
                .nota(vacioComoNulo(dto.getNota()))
                .build());
        cambio(e, EntityChangeEvent.Accion.CREAR, "Deseo: " + obra.getTitulo());
        return ensamblador.uno(yo, e);
    }

    // ------------------------------------------------------------------ listar

    @Override
    @Transactional(readOnly = true)
    public PageDTO<EjemplarDTO> getAll(FiltroLibrosDTO filtro) {
        Long yo = SecurityUtils.usuarioActual();
        FiltroLibrosDTO f = filtro == null ? new FiltroLibrosDTO() : filtro;
        int page = f.getPage() == null || f.getPage() < 0 ? 0 : f.getPage();
        int size = f.getSize() == null || f.getSize() < 1 ? TAMANO_POR_DEFECTO : Math.min(f.getSize(), TAMANO_MAXIMO);

        EjemplarCustomRepository.Pagina pagina = ejemplares.buscar(yo, f, page, size);
        Map<UUID, Ejemplar> porId = pagina.ids().isEmpty() ? Map.of()
                : ejemplares.conObraYArchivo(pagina.ids()).stream()
                .collect(Collectors.toMap(Ejemplar::getId, Function.identity()));
        List<Ejemplar> enOrden = pagina.ids().stream().map(porId::get).toList();

        return PageDTO.<EjemplarDTO>builder()
                .page(page)
                .size(size)
                .totalElements(pagina.total())
                .totalPage((int) ((pagina.total() + size - 1) / size))
                .list(ensamblador.ensamblar(yo, enOrden))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public FacetasDTO facetas() {
        return ejemplares.facetas(SecurityUtils.usuarioActual());
    }

    // ------------------------------------------------------------------ detalle

    @Override
    @Transactional(readOnly = true)
    public EjemplarDetalleDTO getById(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, ejemplarId);
        EjemplarDetalleDTO dto = mapper.aDetalleDTO(e);
        ensamblador.extras(yo, List.of(e.getId())).completar(dto);
        dto.setCapitulos(estructura.capitulos(e.getArchivo() == null ? null : e.getArchivo().getId()));
        dto.setProgreso(progresos.findByUsuarioIdAndEjemplarId(yo, e.getId()).map(mapper::aProgresoDTO).orElse(null));
        return dto;
    }

    // ------------------------------------------------------------------ editar

    @Override
    @Transactional
    public EjemplarDTO saveAndUpdate(LibroSaveDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, dto.getId());
        Obra o = e.getObra();

        boolean datosDeObra = false;
        if (dto.getTitulo() != null && !dto.getTitulo().isBlank()) {
            o.setTitulo(dto.getTitulo().trim());
            datosDeObra = true;
        }
        if (dto.getAutores() != null) {
            o.setAutores(limpiar(dto.getAutores()));
            datosDeObra = true;
        }
        if (dto.getAnio() != null) {
            o.setAnio(dto.getAnio());
            datosDeObra = true;
        }
        if (dto.getEditorial() != null) {
            o.setEditorial(vacioComoNulo(dto.getEditorial()));
            datosDeObra = true;
        }
        if (dto.getSinopsis() != null) {
            o.setSinopsis(vacioComoNulo(dto.getSinopsis()));
            datosDeObra = true;
        }
        if (dto.getGeneros() != null) {
            o.setGeneros(limpiar(dto.getGeneros()));
            datosDeObra = true;
        }
        if (datosDeObra) {
            /* Lo corregido a mano ya no lo pisa el taller. */
            o.setFuenteMetadatos(FuenteMetadatos.MANUAL);
            obras.save(o);
        }

        if (dto.getEtiquetas() != null) e.setEtiquetas(limpiar(dto.getEtiquetas()));
        if (dto.getCalificacion() != null) e.setCalificacion(ValidationUtils.calificacion(dto.getCalificacion()));
        if (dto.getTipo() != null) cambiarTipo(e, dto.getTipo());
        if (dto.getEstado() != null) cambiarEstado(e, dto.getEstado());
        ejemplares.save(e);
        if (dto.getFavorito() != null) estantes.marcarFavorito(yo, e.getId(), dto.getFavorito());

        cambio(e, EntityChangeEvent.Accion.ACTUALIZAR, null);
        return ensamblador.uno(yo, e);
    }

    private static void cambiarTipo(Ejemplar e, TipoEjemplar tipo) {
        ValidationUtils.exigir(tipo != TipoEjemplar.DESEO || e.getArchivo() == null,
                Message.Msj.deseoConArchivo, CodigoError.DATO_INVALIDO);
        e.setTipo(tipo);
    }

    /** Las fechas acompanan al estado: empezar, terminar, releer. */
    static void cambiarEstado(Ejemplar e, EstadoLectura nuevo) {
        EstadoLectura antes = e.getEstado();
        Instant ahora = Instant.now();
        if (nuevo == EstadoLectura.LEYENDO && e.getFechaInicio() == null) {
            e.setFechaInicio(ahora);
        }
        if (nuevo == EstadoLectura.LEIDO && antes != EstadoLectura.LEIDO) {
            e.setFechaFin(ahora);
            e.setVecesLeido(e.getVecesLeido() == null ? 1 : e.getVecesLeido() + 1);
        }
        e.setEstado(nuevo);
    }

    // ------------------------------------------------------------------ borrar

    @Override
    @Transactional
    public boolean delete(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, ejemplarId);
        Archivo archivo = e.getArchivo();
        Obra obra = e.getObra();
        ejemplares.delete(e);
        ejemplares.flush();
        obras.delete(obra);
        if (archivo != null && ejemplares.countByArchivo_Id(archivo.getId()) == 0) {
            /* Nadie mas lo usa: fuera la fila, su cola, su audio y sus ficheros. */
            trabajos.olvidarArchivo(archivo.getId());
            archivos.delete(archivo);
            almacen.borrarTodoDe(archivo.getId());
            log.info("Archivo {} borrado: ya no lo usaba nadie", archivo.getId());
        }
        cambio(e, EntityChangeEvent.Accion.BORRAR, obra.getTitulo());
        return true;
    }

    // ------------------------------------------------------------------ ayudas

    private Ejemplar propio(Long usuarioId, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, usuarioId), Message.Msj.libroNoEncontrado);
    }

    private void cambio(Ejemplar e, EntityChangeEvent.Accion accion, String detalle) {
        eventos.publishEvent(new EntityChangeEvent("Ejemplar", e.getId().toString(), accion, e.getUsuarioId(), detalle));
    }

    static List<String> limpiar(List<String> valores) {
        LinkedHashSet<String> unicos = new LinkedHashSet<>();
        for (String v : valores) {
            if (v != null && !v.isBlank()) unicos.add(v.trim());
        }
        return new ArrayList<>(unicos);
    }

    static String vacioComoNulo(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
