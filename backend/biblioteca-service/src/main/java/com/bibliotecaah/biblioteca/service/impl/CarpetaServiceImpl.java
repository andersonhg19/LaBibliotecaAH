package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.config.Topes;
import com.bibliotecaah.biblioteca.dto.filter.FiltroCarpetaDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaBorrarDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaMoverDTO;
import com.bibliotecaah.biblioteca.dto.input.CarpetaSaveDTO;
import com.bibliotecaah.biblioteca.dto.input.MoverDocumentosDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaBorradaDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaContenidoDTO;
import com.bibliotecaah.biblioteca.dto.output.CarpetaDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.entity.Carpeta;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.repository.CarpetaRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.service.CarpetaService;
import com.bibliotecaah.biblioteca.service.LibroService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Collator;
import java.text.Normalizer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * (v1.6) El archivador de documentos: carpetas y subcarpetas de cada usuario.
 *
 * Un usuario tiene pocas carpetas (tope {@code BIBLIOTECA_MAX_CARPETAS}, 500):
 * cada operacion carga el arbol entero del usuario en UNA consulta y las cuentas
 * de documentos por carpeta en OTRA, y el resto (migas, subarbol, profundidad,
 * cuentas recursivas) se calcula en memoria.
 *
 * Reglas: nombres unicos entre hermanas (sin mayusculas), hasta 10 niveles, una
 * carpeta no entra en si misma ni en sus subcarpetas, solo los DOCUMENTO van en
 * carpetas. Al borrar una carpeta con algo dentro se elige: SUBIR (todo pasa a
 * la carpeta de arriba; las subcarpetas que choquen de nombre se renombran
 * "Nombre (2)") o BORRAR (subcarpetas fuera y documentos RETIRADOS como en
 * "Retirar": lo escrito se conserva y reaparece si se vuelve a subir).
 */
@Slf4j
@Service
@Transactional
public class CarpetaServiceImpl implements CarpetaService {

    static final int PROFUNDIDAD_MAXIMA = 10;
    static final int MAX_DOCUMENTOS = 500;
    static final int MAX_RESULTADOS = 200;
    static final int MAX_NOMBRE = 100;

    private final CarpetaRepository carpetas;
    private final EjemplarRepository ejemplares;
    private final LibroService libros;
    private final EnsambladorDeEjemplares ensamblador;
    private final ApplicationEventPublisher eventos;
    private final Topes topes;

    public CarpetaServiceImpl(CarpetaRepository carpetas, EjemplarRepository ejemplares, LibroService libros,
                              EnsambladorDeEjemplares ensamblador, ApplicationEventPublisher eventos, Topes topes) {
        this.carpetas = carpetas;
        this.ejemplares = ejemplares;
        this.libros = libros;
        this.ensamblador = ensamblador;
        this.eventos = eventos;
        this.topes = topes;
    }

    // ------------------------------------------------------------------ leer

    @Override
    @Transactional(readOnly = true)
    public List<CarpetaDTO> getAll() {
        Arbol a = arbol(SecurityUtils.usuarioActual());
        List<CarpetaDTO> lista = new ArrayList<>();
        a.enProfundidad(null, c -> lista.add(a.dto(c)));
        return lista;
    }

    @Override
    @Transactional(readOnly = true)
    public CarpetaContenidoDTO contenido(FiltroCarpetaDTO filtro) {
        Long yo = SecurityUtils.usuarioActual();
        FiltroCarpetaDTO f = filtro == null ? new FiltroCarpetaDTO() : filtro;
        Arbol a = arbol(yo);
        Carpeta actual = f.getCarpetaId() == null ? null : a.exigir(f.getCarpetaId());
        UUID actualId = actual == null ? null : actual.getId();
        String texto = f.getTexto() == null ? "" : f.getTexto().trim();
        boolean busqueda = !texto.isEmpty();

        List<Carpeta> subcarpetas;
        List<UUID> ids;
        int limite;
        if (busqueda) {
            String clave = normalizar(texto);
            List<Carpeta> dondeBuscar = actualId == null ? a.todas() : a.descendientes(actualId);
            subcarpetas = dondeBuscar.stream().filter(c -> normalizar(c.getNombre()).contains(clave)).toList();
            limite = MAX_RESULTADOS;
            ids = ejemplares.buscarDocumentos(yo, actualId == null ? null : a.subarbol(actualId), texto, f.getOrden(),
                    limite + 1);
        } else {
            subcarpetas = a.hijos(actualId);
            limite = MAX_DOCUMENTOS;
            ids = ejemplares.documentosDeCarpeta(yo, actualId, f.getOrden(), limite + 1);
        }
        boolean recortado = ids.size() > limite;
        List<EjemplarDTO> documentos = enOrden(yo, recortado ? ids.subList(0, limite) : ids);

        Map<UUID, String> ubicaciones = new LinkedHashMap<>();
        if (busqueda) {
            documentos.stream().map(EjemplarDTO::getCarpetaId).filter(Objects::nonNull)
                    .forEach(id -> ubicaciones.computeIfAbsent(id, a::rutaTexto));
            subcarpetas.stream().map(Carpeta::getPadreId).filter(Objects::nonNull)
                    .forEach(id -> ubicaciones.computeIfAbsent(id, a::rutaTexto));
        }
        return CarpetaContenidoDTO.builder()
                .carpeta(actual == null ? null : a.dto(actual))
                .ruta(a.ruta(actualId).stream().map(a::dto).toList())
                .subcarpetas(ordenar(subcarpetas, f.getOrden()).stream().map(a::dto).toList())
                .documentos(documentos)
                .totalDocumentos(a.totalDocumentos())
                .busqueda(busqueda)
                .recortado(recortado)
                .ubicaciones(ubicaciones)
                .build();
    }

    private List<EjemplarDTO> enOrden(Long yo, List<UUID> ids) {
        if (ids.isEmpty()) return new ArrayList<>();
        Map<UUID, Ejemplar> porId = ejemplares.conObraYArchivo(ids).stream()
                .collect(Collectors.toMap(Ejemplar::getId, Function.identity()));
        return ensamblador.ensamblar(yo, ids.stream().map(porId::get).filter(Objects::nonNull).toList());
    }

    static List<Carpeta> ordenar(List<Carpeta> lista, FiltroCarpetaDTO.Orden orden) {
        Collator collator = Collator.getInstance(Locale.forLanguageTag("es"));
        collator.setStrength(Collator.SECONDARY);
        Comparator<Carpeta> porNombre = Comparator.comparing(Carpeta::getNombre, collator);
        Comparator<Carpeta> criterio = switch (orden == null ? FiltroCarpetaDTO.Orden.NOMBRE : orden) {
            case NOMBRE -> porNombre;
            case RECIENTES -> Comparator.comparing(Carpeta::getCreation, Comparator.nullsLast(Comparator.reverseOrder()));
            case ANTIGUOS -> Comparator.comparing(Carpeta::getCreation, Comparator.nullsLast(Comparator.naturalOrder()));
        };
        return lista.stream().sorted(criterio.thenComparing(porNombre).thenComparing(Carpeta::getId)).toList();
    }

    // ------------------------------------------------------------------ crear, renombrar, mover

    @Override
    public CarpetaDTO saveAndUpdate(CarpetaSaveDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        String nombre = limpiarNombre(dto.getNombre());
        Arbol a = arbol(yo);
        Carpeta carpeta;
        if (dto.getId() == null) {
            ValidationUtils.exigir(a.cuantas() < topes.getCarpetasPorUsuario(), Message.Msj.demasiadasCarpetas,
                    CodigoError.DATO_INVALIDO, String.valueOf(topes.getCarpetasPorUsuario()));
            UUID padre = dto.getPadreId();
            if (padre != null) a.exigir(padre);
            ValidationUtils.exigir(a.profundidad(padre) + 1 <= PROFUNDIDAD_MAXIMA, Message.Msj.carpetaDemasiadoProfunda,
                    CodigoError.DATO_INVALIDO, String.valueOf(PROFUNDIDAD_MAXIMA));
            exigirNombreLibre(a, padre, nombre, null);
            carpeta = Carpeta.builder().id(UUID.randomUUID()).usuarioId(yo).padreId(padre).nombre(nombre).build();
        } else {
            carpeta = a.exigir(dto.getId());
            exigirNombreLibre(a, carpeta.getPadreId(), nombre, carpeta.getId());
            carpeta.setNombre(nombre);
        }
        Carpeta guardada = carpetas.saveAndFlush(carpeta);
        cambio(guardada, dto.getId() == null ? EntityChangeEvent.Accion.CREAR : EntityChangeEvent.Accion.ACTUALIZAR,
                guardada.getNombre());
        return dto.getId() == null ? new CarpetaDTO(guardada.getId(), guardada.getNombre(), guardada.getPadreId(), 0, 0)
                : a.dto(guardada);
    }

    @Override
    public CarpetaDTO mover(CarpetaMoverDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        Arbol a = arbol(yo);
        Carpeta carpeta = a.exigir(dto.getCarpetaId());
        UUID destino = dto.getDestinoId();
        if (destino != null) {
            a.exigir(destino);
            ValidationUtils.exigir(!a.subarbol(carpeta.getId()).contains(destino), Message.Msj.carpetaDentroDeSiMisma,
                    CodigoError.DATO_INVALIDO);
        }
        if (Objects.equals(destino, carpeta.getPadreId())) {
            return a.dto(carpeta);
        }
        ValidationUtils.exigir(a.profundidad(destino) + a.altura(carpeta.getId()) <= PROFUNDIDAD_MAXIMA,
                Message.Msj.carpetaDemasiadoProfunda, CodigoError.DATO_INVALIDO, String.valueOf(PROFUNDIDAD_MAXIMA));
        exigirNombreLibre(a, destino, carpeta.getNombre(), carpeta.getId());
        carpeta.setPadreId(destino);
        carpetas.saveAndFlush(carpeta);
        cambio(carpeta, EntityChangeEvent.Accion.ACTUALIZAR, "Movida a " + (destino == null ? "la raiz" : destino));
        return a.dto(carpeta);
    }

    @Override
    public int moverDocumentos(MoverDocumentosDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        UUID destino = dto.getCarpetaId();
        if (destino != null) {
            ValidationUtils.encontrado(carpetas.findByIdAndUsuarioId(destino, yo), Message.Msj.carpetaNoEncontrada);
        }
        List<UUID> ids = new ArrayList<>(new LinkedHashSet<>(dto.getEjemplarIds().stream().filter(Objects::nonNull).toList()));
        List<Ejemplar> propios = ejemplares.conObraYArchivo(ids).stream().filter(e -> yo.equals(e.getUsuarioId())).toList();
        ValidationUtils.exigir(propios.size() == ids.size(), Message.Msj.libroNoEncontrado, CodigoError.NO_ENCONTRADO);
        for (Ejemplar e : propios) {
            ValidationUtils.exigir(e.getTipo() == TipoEjemplar.DOCUMENTO, Message.Msj.soloDocumentosEnCarpetas,
                    CodigoError.DATO_INVALIDO, e.getObra().getTitulo());
        }
        int movidos = ejemplares.moverDocumentos(yo, ids, destino);
        for (Ejemplar e : propios) {
            eventos.publishEvent(new EntityChangeEvent("Ejemplar", e.getId().toString(),
                    EntityChangeEvent.Accion.ACTUALIZAR, yo, "Carpeta: " + (destino == null ? "raiz" : destino)));
        }
        log.info("Usuario {} movio {} documento(s) a la carpeta {}", yo, movidos, destino == null ? "raiz" : destino);
        return movidos;
    }

    // ------------------------------------------------------------------ borrar

    @Override
    public CarpetaBorradaDTO delete(UUID carpetaId, CarpetaBorrarDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        Arbol a = arbol(yo);
        Carpeta carpeta = a.exigir(carpetaId);
        List<Carpeta> hijas = a.hijos(carpeta.getId());
        long documentos = a.documentos(carpeta.getId());
        CarpetaBorrarDTO.Contenido que = dto == null ? null : dto.getContenido();
        boolean vacia = hijas.isEmpty() && documentos == 0;
        ValidationUtils.exigir(vacia || que != null, Message.Msj.carpetaNoVacia, CodigoError.DATO_INVALIDO,
                String.valueOf(documentos), String.valueOf(hijas.size()));

        CarpetaBorradaDTO r = new CarpetaBorradaDTO(0, 0, 0, 1);
        if (!vacia && que == CarpetaBorrarDTO.Contenido.SUBIR) {
            UUID destino = carpeta.getPadreId();
            r.setDocumentosMovidos(ejemplares.moverDocumentos(yo,
                    ejemplares.documentosEn(yo, List.of(carpeta.getId())), destino));
            Set<String> ocupados = new HashSet<>();
            a.hijos(destino).forEach(h -> ocupados.add(clave(h.getNombre())));
            for (Carpeta hija : hijas) {
                hija.setNombre(nombreLibre(hija.getNombre(), ocupados));
                hija.setPadreId(destino);
            }
            carpetas.saveAllAndFlush(hijas);
            r.setCarpetasMovidas(hijas.size());
        } else if (!vacia) {
            Set<UUID> subarbol = a.subarbol(carpeta.getId());
            List<UUID> retirar = ejemplares.documentosEn(yo, subarbol);
            for (UUID id : retirar) {
                libros.delete(id);
            }
            r.setDocumentosRetirados(retirar.size());
            r.setCarpetasBorradas(subarbol.size());
        }
        carpetas.delete(carpeta);
        carpetas.flush();
        cambio(carpeta, EntityChangeEvent.Accion.BORRAR, carpeta.getNombre() + " (" + (que == null ? "vacia" : que) + ")");
        log.info("Usuario {} borro la carpeta {}: {} movidos, {} retirados, {} carpetas borradas", yo, carpeta.getId(),
                r.getDocumentosMovidos(), r.getDocumentosRetirados(), r.getCarpetasBorradas());
        return r;
    }

    // ------------------------------------------------------------------ ayudas

    private Arbol arbol(Long usuarioId) {
        return new Arbol(carpetas.findByUsuarioId(usuarioId), ejemplares.documentosPorCarpeta(usuarioId));
    }

    private static void exigirNombreLibre(Arbol a, UUID padre, String nombre, UUID excepto) {
        String buscado = clave(nombre);
        for (Carpeta hermana : a.hijos(padre)) {
            if (!hermana.getId().equals(excepto) && clave(hermana.getNombre()).equals(buscado)) {
                throw new ValidationException(Message.Msj.carpetaDuplicada, CodigoError.DUPLICADO, nombre);
            }
        }
    }

    /** "Proyectos" ya existe: "Proyectos (2)", "Proyectos (3)"... sin pasar de 100 caracteres. */
    static String nombreLibre(String nombre, Set<String> ocupados) {
        String candidato = nombre;
        for (int n = 2; ocupados.contains(clave(candidato)); n++) {
            String sufijo = " (" + n + ")";
            candidato = (nombre.length() + sufijo.length() > MAX_NOMBRE
                    ? nombre.substring(0, MAX_NOMBRE - sufijo.length()) : nombre) + sufijo;
        }
        ocupados.add(clave(candidato));
        return candidato;
    }

    /** Sin espacios a los lados ni repetidos, sin caracteres de control. */
    static String limpiarNombre(String nombre) {
        return nombre.replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").trim();
    }

    private static String clave(String nombre) {
        return nombre.toLowerCase(Locale.ROOT);
    }

    static String normalizar(String texto) {
        return Normalizer.normalize(texto.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    private void cambio(Carpeta c, EntityChangeEvent.Accion accion, String detalle) {
        eventos.publishEvent(new EntityChangeEvent("Carpeta", c.getId().toString(), accion, c.getUsuarioId(), detalle));
    }

    /**
     * El arbol de carpetas de UN usuario en memoria, con las cuentas de documentos.
     * La clave null de {@code hijos} y {@code directos} es la raiz. Todas las
     * subidas por padres llevan tope por si la base tuviera un ciclo.
     */
    static final class Arbol {
        private final Map<UUID, Carpeta> porId = new LinkedHashMap<>();
        private final Map<UUID, List<Carpeta>> hijos = new HashMap<>();
        private final Map<UUID, Long> directos;

        Arbol(List<Carpeta> lista, Map<UUID, Long> directos) {
            this.directos = directos;
            for (Carpeta c : lista) {
                porId.put(c.getId(), c);
            }
            for (Carpeta c : lista) {
                UUID padre = c.getPadreId() != null && porId.containsKey(c.getPadreId()) ? c.getPadreId() : null;
                hijos.computeIfAbsent(padre, k -> new ArrayList<>()).add(c);
            }
        }

        int cuantas() {
            return porId.size();
        }

        Carpeta exigir(UUID id) {
            return ValidationUtils.encontrado(Optional.ofNullable(porId.get(id)), Message.Msj.carpetaNoEncontrada);
        }

        List<Carpeta> todas() {
            return new ArrayList<>(porId.values());
        }

        List<Carpeta> hijos(UUID id) {
            return hijos.getOrDefault(id, List.of());
        }

        /** La carpeta y todas las de debajo. */
        Set<UUID> subarbol(UUID id) {
            Set<UUID> vistos = new LinkedHashSet<>();
            Deque<UUID> pendientes = new ArrayDeque<>(List.of(id));
            while (!pendientes.isEmpty()) {
                UUID x = pendientes.pop();
                if (vistos.add(x)) hijos(x).forEach(h -> pendientes.push(h.getId()));
            }
            return vistos;
        }

        List<Carpeta> descendientes(UUID id) {
            return subarbol(id).stream().filter(x -> !x.equals(id)).map(porId::get).toList();
        }

        /** Niveles hasta la raiz: raiz 0, carpeta de primer nivel 1. */
        int profundidad(UUID id) {
            int d = 0;
            for (UUID x = id; x != null && d <= porId.size(); x = porId.get(x).getPadreId()) {
                if (!porId.containsKey(x)) break;
                d++;
            }
            return d;
        }

        /** Niveles que ocupa la carpeta con lo de debajo (sola = 1). */
        int altura(UUID id) {
            return altura(id, 0);
        }

        private int altura(UUID id, int nivel) {
            if (nivel > porId.size()) return nivel;
            int max = 0;
            for (Carpeta h : hijos(id)) max = Math.max(max, altura(h.getId(), nivel + 1));
            return 1 + max;
        }

        /** Documentos de la carpeta y de todas sus subcarpetas. */
        long documentos(UUID id) {
            return subarbol(id).stream().mapToLong(x -> directos.getOrDefault(x, 0L)).sum();
        }

        long totalDocumentos() {
            return directos.values().stream().mapToLong(Long::longValue).sum();
        }

        /** De la primera carpeta bajo la raiz hasta esta (vacia para la raiz). */
        List<Carpeta> ruta(UUID id) {
            List<Carpeta> ruta = new ArrayList<>();
            for (UUID x = id; x != null && porId.containsKey(x) && ruta.size() <= porId.size(); x = porId.get(x).getPadreId()) {
                ruta.add(0, porId.get(x));
            }
            return ruta;
        }

        String rutaTexto(UUID id) {
            return ruta(id).stream().map(Carpeta::getNombre).collect(Collectors.joining(" / "));
        }

        /** Recorrido en profundidad con las hermanas por nombre. */
        void enProfundidad(UUID desde, java.util.function.Consumer<Carpeta> visitar) {
            Set<UUID> vistos = new HashSet<>();
            Deque<Carpeta> pila = new ArrayDeque<>();
            List<Carpeta> raiz = ordenar(hijos(desde), FiltroCarpetaDTO.Orden.NOMBRE);
            for (int i = raiz.size() - 1; i >= 0; i--) pila.push(raiz.get(i));
            while (!pila.isEmpty()) {
                Carpeta c = pila.pop();
                if (!vistos.add(c.getId())) continue;
                visitar.accept(c);
                List<Carpeta> suyas = ordenar(hijos(c.getId()), FiltroCarpetaDTO.Orden.NOMBRE);
                for (int i = suyas.size() - 1; i >= 0; i--) pila.push(suyas.get(i));
            }
        }

        CarpetaDTO dto(Carpeta c) {
            return new CarpetaDTO(c.getId(), c.getNombre(), c.getPadreId(), documentos(c.getId()), hijos(c.getId()).size());
        }
    }
}
