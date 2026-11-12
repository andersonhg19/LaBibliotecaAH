package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.config.Topes;
import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.exception.ValidationException;
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
import com.bibliotecaah.biblioteca.repository.CarpetaRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarCustomRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.ObraRepository;
import com.bibliotecaah.biblioteca.repository.ProgresoRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.EstanteService;
import com.bibliotecaah.biblioteca.service.IngestaService;
import com.bibliotecaah.biblioteca.service.LibroService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.ClasificadorDeMaterias;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.Mensajes;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import com.bibliotecaah.biblioteca.repository.EstanteItemRepository;
import org.springframework.transaction.support.TransactionTemplate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
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
    private final Topes topes;
    private final EstanteItemRepository estanteItems;
    private final TransactionTemplate tx;
    private final CarpetaRepository carpetas;

    public LibroServiceImpl(EjemplarRepository ejemplares, ObraRepository obras, ArchivoRepository archivos,
                            ProgresoRepository progresos, TrabajoRepository trabajos, IngestaService ingesta,
                            EstanteService estantes, EnsambladorDeEjemplares ensamblador,
                            LectorDeEstructura estructura, BibliotecaMapper mapper, AlmacenDeArchivos almacen,
                            Mensajes mensajes, ApplicationEventPublisher eventos, Topes topes,
                            EstanteItemRepository estanteItems, TransactionTemplate tx, CarpetaRepository carpetas) {
        this.carpetas = carpetas;
        this.topes = topes;
        this.estanteItems = estanteItems;
        this.tx = tx;
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
    public ResultDTO subir(List<MultipartFile> ficheros, TipoEjemplar tipo, UUID deseoId, UUID carpetaId) {
        Long yo = SecurityUtils.usuarioActual();
        /* Los vacios tambien pasan: la ingesta los rechaza con "el archivo esta
           vacio" (QA BI-21: antes se descartaban aqui y el mensaje era "no llego
           ningun archivo"). */
        List<MultipartFile> validos = ficheros == null ? List.of()
                : ficheros.stream().filter(f -> f != null).toList();
        ValidationUtils.exigir(!validos.isEmpty(), Message.Msj.sinArchivos, CodigoError.DATO_INVALIDO);
        if (carpetaId != null) {
            /* (v1.6) Subir directamente a una carpeta: solo documentos, y la carpeta debe ser suya. */
            ValidationUtils.exigir(tipo == TipoEjemplar.DOCUMENTO && deseoId == null, Message.Msj.carpetaSoloDocumentos,
                    CodigoError.DATO_INVALIDO);
            ValidationUtils.encontrado(carpetas.findByIdAndUsuarioId(carpetaId, yo), Message.Msj.carpetaNoEncontrada);
        }
        if (deseoId != null) {
            /* QA BI-15 ("Ya lo tengo"): antes de copiar nada, el deseo debe ser suyo y seguir siendo deseo. */
            ValidationUtils.exigir(validos.size() == 1, Message.Msj.deseoUnSoloArchivo, CodigoError.DATO_INVALIDO,
                    validos.size());
            ValidationUtils.exigir(propio(yo, deseoId).getTipo() == TipoEjemplar.DESEO, Message.Msj.noEsUnDeseo,
                    CodigoError.DATO_INVALIDO);
        }
        /* QA SE-07: topes por peticion y espacio en disco ANTES de copiar nada. */
        ValidationUtils.exigir(validos.size() <= topes.getArchivosPorSubida(), Message.Msj.demasiadosArchivos,
                CodigoError.DEMASIADO_GRANDE, String.valueOf(topes.getArchivosPorSubida()),
                String.valueOf(validos.size()));
        almacen.exigirDisponible();
        long necesario = validos.stream().mapToLong(MultipartFile::getSize).sum() + topes.getEspacioLibreMinimoBytes();
        if (almacen.espacioLibre() < necesario) {
            log.error("Subida rechazada por falta de espacio en /datos: libres {} bytes, hacen falta {}",
                    almacen.espacioLibre(), necesario);
            throw new ValidationException(Message.Msj.sinEspacio, CodigoError.SIN_ESPACIO);
        }

        List<EjemplarDTO> aceptados = new ArrayList<>();
        List<String> rechazos = new ArrayList<>();
        List<String> yaEstaban = new ArrayList<>();
        for (MultipartFile f : validos) {
            try (InputStream in = f.getInputStream()) {
                IngestaService.Resultado r = ingesta.ingerir(yo, f.getOriginalFilename(), in, tipo);
                if (r.aceptado()) {
                    aceptados.add(r.ejemplar());
                    if (Boolean.TRUE.equals(r.ejemplar().getYaLoTenias())) {
                        yaEstaban.add("\"" + f.getOriginalFilename() + "\"");
                    }
                } else {
                    rechazos.add(r.rechazo());
                }
            } catch (IOException e) {
                log.error("Fallo leyendo la subida {}: {}", f.getOriginalFilename(), e.getMessage(), e);
                rechazos.add(mensajes.texto(Message.Msj.subidaIncompleta) + " (" + f.getOriginalFilename() + ")");
            }
        }
        if (aceptados.isEmpty()) {
            return new ResultDTO(false, mensajes.texto(Message.Msj.ningunArchivoAceptado, String.join(" ", rechazos)),
                    CodigoError.DATO_INVALIDO, aceptados);
        }
        if (deseoId != null) {
            EjemplarDTO llegado = aceptados.get(0);
            aceptados.set(0, tx.execute(s -> cumplirDeseo(yo, deseoId, llegado)));
        }
        if (carpetaId != null) {
            ponerEnCarpeta(yo, aceptados, carpetaId);
        }
        String mensaje = rechazos.isEmpty() ? "OK"
                : mensajes.texto(Message.Msj.algunosRechazados, aceptados.size(), String.join(" ", rechazos));
        if (!yaEstaban.isEmpty()) {
            /* QA BI-16: subir lo que ya tienes no es "agregado": se avisa. */
            String aviso = mensajes.texto(Message.Msj.yaLoTenias, String.join(", ", yaEstaban));
            mensaje = "OK".equals(mensaje) ? aviso : mensaje + " " + aviso;
        }
        return new ResultDTO(true, mensaje, CodigoError.OK, aceptados);
    }

    /**
     * QA BI-15: el deseo se convierte en el ejemplar que acaba de llegar (nuevo, el que ya tenia o uno
     * retirado que reaparece): este hereda la nota (si no tenia; si tenia, se unen), las etiquetas y los
     * estantes del deseo en su misma posicion, y el ISBN si su obra no lo tenia. Despues el deseo se borra.
     */
    private EjemplarDTO cumplirDeseo(Long yo, UUID deseoId, EjemplarDTO llegado) {
        Ejemplar deseo = ejemplares.delUsuario(deseoId, yo).orElse(null);
        Ejemplar ejemplar = propio(yo, llegado.getId());
        if (deseo == null || deseo.getTipo() != TipoEjemplar.DESEO) {
            /* Otra peticion lo cumplio o lo borro mientras se subia: el archivo ya esta, no hay nada que heredar. */
            log.info("El deseo {} ya no estaba al terminar la subida de {}", deseoId, ejemplar.getId());
            return llegado;
        }
        String nota = deseo.getNota();
        if (nota != null && !nota.equals(ejemplar.getNota())) {
            ejemplar.setNota(ejemplar.getNota() == null ? nota : ejemplar.getNota() + "\n\n" + nota);
        }
        List<String> etiquetas = new ArrayList<>(ejemplar.getEtiquetas() == null ? List.of() : ejemplar.getEtiquetas());
        if (deseo.getEtiquetas() != null) etiquetas.addAll(deseo.getEtiquetas());
        ejemplar.setEtiquetas(limpiar(etiquetas));
        Obra obra = ejemplar.getObra();
        if (obra.getIsbn() == null && deseo.getObra().getIsbn() != null) {
            obra.setIsbn(deseo.getObra().getIsbn());
            obras.save(obra);
        }
        ejemplares.saveAndFlush(ejemplar);
        int heredados = estanteItems.heredarEstantes(deseo.getId(), ejemplar.getId(), yo);
        Obra obraDeseo = deseo.getObra();
        ejemplares.delete(deseo);
        ejemplares.flush();
        obras.delete(obraDeseo);
        cambio(deseo, EntityChangeEvent.Accion.BORRAR, "Deseo cumplido por " + ejemplar.getId());
        cambio(ejemplar, EntityChangeEvent.Accion.ACTUALIZAR, "Cumple el deseo " + deseo.getId());
        log.info("Usuario {}: el deseo {} se cumplio con el ejemplar {} ({} estantes heredados)", yo, deseo.getId(),
                ejemplar.getId(), heredados);
        EjemplarDTO dto = ensamblador.uno(yo, ejemplar);
        dto.setYaLoTenias(llegado.getYaLoTenias());
        return dto;
    }

    /**
     * (v1.6) Los documentos que acaban de llegar (no los que ya tenias, que se quedan donde estaban) entran en
     * la carpeta elegida. Un documento retirado que reaparece tambien va a esa carpeta.
     */
    private void ponerEnCarpeta(Long yo, List<EjemplarDTO> aceptados, UUID carpetaId) {
        List<EjemplarDTO> nuevos = aceptados.stream()
                .filter(d -> d.getTipo() == TipoEjemplar.DOCUMENTO && !Boolean.TRUE.equals(d.getYaLoTenias())).toList();
        ejemplares.moverDocumentos(yo, nuevos.stream().map(EjemplarDTO::getId).toList(), carpetaId);
        nuevos.forEach(d -> d.setCarpetaId(carpetaId));
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
    public FacetasDTO facetas(FiltroLibrosDTO.Pestana pestana) {
        return ejemplares.facetas(SecurityUtils.usuarioActual(), pestana);
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

        /* v1.2 (QA BI-07, BI-08): campo ausente = no se toca; campo enviado
           como null = se vacia. El titulo no se puede vaciar. */
        boolean datosDeObra = false;
        if (dto.getTitulo() != null && !dto.getTitulo().isBlank()) {
            o.setTitulo(dto.getTitulo().trim());
            datosDeObra = true;
        }
        if (dto.tocar("autores", dto.getAutores())) {
            o.setAutores(limpiar(dto.getAutores()));
            datosDeObra = true;
        }
        if (dto.tocar("anio", dto.getAnio())) {
            o.setAnio(dto.getAnio());
            datosDeObra = true;
        }
        if (dto.tocar("editorial", dto.getEditorial())) {
            o.setEditorial(vacioComoNulo(dto.getEditorial()));
            datosDeObra = true;
        }
        if (dto.tocar("sinopsis", dto.getSinopsis())) {
            o.setSinopsis(vacioComoNulo(dto.getSinopsis()));
            datosDeObra = true;
        }
        if (dto.tocar("generos", dto.getGeneros())) {
            /* Sinonimos al nombre canonico ("fantastico" -> "Fantasía"); lo demas, tal cual. */
            o.setGeneros(ClasificadorDeMaterias.normalizarGeneros(dto.getGeneros()));
            datosDeObra = true;
        }
        if (datosDeObra) {
            /* Lo corregido a mano ya no lo pisa el taller. */
            o.setFuenteMetadatos(FuenteMetadatos.MANUAL);
            obras.save(o);
        }

        if (dto.tocar("etiquetas", dto.getEtiquetas())) e.setEtiquetas(limpiar(dto.getEtiquetas()));
        if (dto.tocar("calificacion", dto.getCalificacion())) {
            e.setCalificacion(ValidationUtils.calificacion(dto.getCalificacion()));
        }
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
        /* QA BI-15: un deseo solo deja de serlo al subir su archivo (subir con deseoId). */
        ValidationUtils.exigir(e.getTipo() != TipoEjemplar.DESEO || tipo == TipoEjemplar.DESEO,
                Message.Msj.deseoSoloConArchivo, CodigoError.DATO_INVALIDO);
        e.setTipo(tipo);
        /* (v1.6) Solo los documentos viven en carpetas. */
        if (tipo != TipoEjemplar.DOCUMENTO) e.setCarpetaId(null);
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
        if (antes == EstadoLectura.LEIDO && (nuevo == EstadoLectura.POR_LEER || nuevo == EstadoLectura.LEYENDO)) {
            /* QA BI-27: si vuelve a estar por leer o en lectura, ya no esta
               "terminado". Las lecturas completas siguen en veces_leido. */
            e.setFechaFin(null);
        }
        e.setEstado(nuevo);
    }

    // ------------------------------------------------------------------ retirar

    /**
     * Retirar de la biblioteca (QA BI-01).
     *
     * Un DESEO se borra de verdad (no tiene archivo con el que reencontrarlo).
     * Un LIBRO o DOCUMENTO se RETIRA: deja de verse en todas partes y suelta el
     * archivo, pero su progreso, notas, resaltados, diario, calificacion,
     * estantes y datos editados se conservan; si el mismo usuario vuelve a subir
     * el mismo fichero (mismo sha256), reaparece con todo (IngestaServiceImpl).
     *
     * Si nadie mas usa el archivo: fuera su fila, su cola (trabajos PENDIENTE y
     * EN_CURSO, QA DA-14/DA-28), sus filas de audio y, DESPUES del commit, sus
     * ficheros. Lo que el taller escriba tarde (un trabajo que ya estaba en
     * marcha) lo recoge TareaLimpieza.
     */
    @Override
    @Transactional
    public boolean delete(UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, ejemplarId);
        Archivo archivo = e.getArchivo();
        Obra obra = e.getObra();
        if (e.getTipo() == TipoEjemplar.DESEO || archivo == null) {
            ejemplares.delete(e);
            ejemplares.flush();
            obras.delete(obra);
        } else {
            e.setArchivoSha256(archivo.getSha256());
            e.setArchivo(null);
            e.setRetiradoEn(Instant.now());
            ejemplares.saveAndFlush(e);
        }
        if (archivo != null && ejemplares.countByArchivo_Id(archivo.getId()) == 0) {
            UUID archivoId = archivo.getId();
            trabajos.olvidarArchivo(archivoId);
            archivos.delete(archivo);
            despuesDelCommit(() -> almacen.borrarTodoDe(archivoId));
            log.info("Archivo {} borrado: ya no lo usaba nadie", archivoId);
        }
        cambio(e, EntityChangeEvent.Accion.BORRAR, obra.getTitulo());
        return true;
    }

    /** Ficheros fuera solo si la base confirmo el borrado; sin transaccion, ya. */
    static void despuesDelCommit(Runnable accion) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            accion.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                accion.run();
            }
        });
    }

    // ------------------------------------------------------------------ ayudas

    private Ejemplar propio(Long usuarioId, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, usuarioId), Message.Msj.libroNoEncontrado);
    }

    private void cambio(Ejemplar e, EntityChangeEvent.Accion accion, String detalle) {
        eventos.publishEvent(new EntityChangeEvent("Ejemplar", e.getId().toString(), accion, e.getUsuarioId(), detalle));
    }

    /** Sin vacios ni repetidos (sin distinguir mayusculas, QA BI-23: gana la primera forma). null = lista vacia. */
    static List<String> limpiar(List<String> valores) {
        java.util.LinkedHashMap<String, String> unicos = new java.util.LinkedHashMap<>();
        if (valores == null) return new ArrayList<>();
        for (String v : valores) {
            if (v != null && !v.isBlank()) unicos.putIfAbsent(v.trim().toLowerCase(java.util.Locale.ROOT), v.trim());
        }
        return new ArrayList<>(unicos.values());
    }

    static String vacioComoNulo(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
