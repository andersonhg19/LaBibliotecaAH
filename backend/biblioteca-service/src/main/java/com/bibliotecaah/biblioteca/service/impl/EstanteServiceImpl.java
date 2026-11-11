package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.config.Topes;
import com.bibliotecaah.biblioteca.dto.input.EstanteEjemplarDTO;
import com.bibliotecaah.biblioteca.dto.input.EstanteSaveDTO;
import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.dto.output.EstanteDTO;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Estante;
import com.bibliotecaah.biblioteca.entity.EstanteItem;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEstante;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.EstanteItemRepository;
import com.bibliotecaah.biblioteca.repository.EstanteRepository;
import com.bibliotecaah.biblioteca.service.EstanteService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Estantes del usuario. FAVORITOS es de sistema: se crea solo la primera vez
 * que hace falta, no se renombra ni se borra.
 *
 * ORDEN FRACCIONAL: mover un libro entre otros dos le da el punto medio de sus
 * ordenes, sin reescribir el resto. Cuando dos vecinos quedan demasiado juntos
 * (tras ~50 movimientos en el mismo hueco) se renumera el estante 1, 2, 3...
 */
@Slf4j
@Service
@Transactional
public class EstanteServiceImpl implements EstanteService {

    static final String NOMBRE_FAVORITOS = "Favoritos";
    static final double HUECO_MINIMO = 1e-9;

    private final EstanteRepository estantes;
    private final EstanteItemRepository items;
    private final EjemplarRepository ejemplares;
    private final EnsambladorDeEjemplares ensamblador;
    private final ApplicationEventPublisher eventos;
    private final Topes topes;

    public EstanteServiceImpl(EstanteRepository estantes, EstanteItemRepository items, EjemplarRepository ejemplares,
                              EnsambladorDeEjemplares ensamblador, ApplicationEventPublisher eventos, Topes topes) {
        this.topes = topes;
        this.estantes = estantes;
        this.items = items;
        this.ejemplares = ejemplares;
        this.ensamblador = ensamblador;
        this.eventos = eventos;
    }

    Estante favoritosDe(Long usuarioId) {
        return estantes.findByUsuarioIdAndTipo(usuarioId, TipoEstante.FAVORITOS).orElseGet(() -> {
            /* Sin chocar si dos peticiones lo crean a la vez (QA BI-09). */
            estantes.crearFavoritosSiFalta(UUID.randomUUID(), usuarioId, NOMBRE_FAVORITOS);
            return estantes.findByUsuarioIdAndTipo(usuarioId, TipoEstante.FAVORITOS).orElseThrow();
        });
    }

    @Override
    public List<EstanteDTO> getAll() {
        Long yo = SecurityUtils.usuarioActual();
        favoritosDe(yo);
        List<Estante> lista = new ArrayList<>(estantes.findByUsuarioIdOrderByOrdenAscNombreAsc(yo));
        lista.sort(Comparator.comparing((Estante e) -> e.getTipo() != TipoEstante.FAVORITOS));
        return lista.stream().map(this::aDTO).toList();
    }

    @Override
    public EstanteDTO saveAndUpdate(EstanteSaveDTO dto) {
        Long yo = SecurityUtils.usuarioActual();
        String nombre = dto.getNombre().trim();
        estantes.findFirstByUsuarioIdAndNombreIgnoreCase(yo, nombre)
                .filter(otro -> !otro.getId().equals(dto.getId()))
                .ifPresent(otro -> {
                    throw new ValidationException(Message.Msj.estanteDuplicado, CodigoError.DUPLICADO, nombre);
                });
        Estante estante;
        if (dto.getId() == null) {
            /* QA SE-07: tope de colecciones por usuario. */
            ValidationUtils.exigir(estantes.countByUsuarioIdAndTipo(yo, TipoEstante.COLECCION) < topes.getEstantesPorUsuario(),
                    Message.Msj.demasiadosEstantes, CodigoError.DATO_INVALIDO, String.valueOf(topes.getEstantesPorUsuario()));
            estante = Estante.builder()
                    .id(UUID.randomUUID())
                    .usuarioId(yo)
                    .tipo(TipoEstante.COLECCION)
                    .orden(estantes.findByUsuarioIdOrderByOrdenAscNombreAsc(yo).size())
                    .build();
        } else {
            estante = propio(yo, dto.getId());
            ValidationUtils.exigir(estante.getTipo() != TipoEstante.FAVORITOS || NOMBRE_FAVORITOS.equals(nombre),
                    Message.Msj.favoritosNoSeRenombra, CodigoError.DATO_INVALIDO);
        }
        estante.setNombre(nombre);
        estante.setColorMadera(dto.getColorMadera());
        Estante guardado = estantes.save(estante);
        cambio(guardado, dto.getId() == null ? EntityChangeEvent.Accion.CREAR : EntityChangeEvent.Accion.ACTUALIZAR);
        return aDTO(guardado);
    }

    @Override
    public boolean delete(UUID estanteId) {
        Estante estante = propio(SecurityUtils.usuarioActual(), estanteId);
        ValidationUtils.exigir(estante.getTipo() != TipoEstante.FAVORITOS,
                Message.Msj.favoritosNoSeBorra, CodigoError.DATO_INVALIDO);
        estantes.delete(estante);
        cambio(estante, EntityChangeEvent.Accion.BORRAR);
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public List<EjemplarDTO> libros(UUID estanteId) {
        Long yo = SecurityUtils.usuarioActual();
        Estante estante = propio(yo, estanteId);
        List<EstanteItem> orden = items.findByEstanteIdOrderByOrdenAsc(estante.getId());
        if (orden.isEmpty()) return new ArrayList<>();
        Map<UUID, Ejemplar> porId = ejemplares.conObraYArchivo(orden.stream().map(EstanteItem::getEjemplarId).toList())
                .stream().collect(Collectors.toMap(Ejemplar::getId, Function.identity()));
        /* Los retirados (QA BI-01) siguen en el estante para cuando vuelvan, pero no se ven. */
        List<Ejemplar> enOrden = orden.stream().map(i -> porId.get(i.getEjemplarId())).filter(java.util.Objects::nonNull).toList();
        return ensamblador.ensamblar(yo, enOrden);
    }

    @Override
    public boolean agregar(UUID estanteId, UUID ejemplarId) {
        Long yo = SecurityUtils.usuarioActual();
        Estante estante = propio(yo, estanteId);
        agregarA(estante, ejemplarPropio(yo, ejemplarId));
        return true;
    }

    /** Idempotente y sin carreras (QA BI-09): INSERT ... ON CONFLICT DO NOTHING. */
    private void agregarA(Estante estante, UUID ejemplarId) {
        items.agregarSiFalta(estante.getId(), ejemplarId, SecurityUtils.getAuthenticatedUserId());
    }

    @Override
    public boolean quitar(UUID estanteId, UUID ejemplarId) {
        Estante estante = propio(SecurityUtils.usuarioActual(), estanteId);
        items.quitar(estante.getId(), ejemplarId);
        return true;
    }

    @Override
    public void marcarFavorito(Long usuarioId, UUID ejemplarId, boolean favorito) {
        Estante fav = favoritosDe(usuarioId);
        if (favorito) agregarA(fav, ejemplarId);
        else items.quitar(fav.getId(), ejemplarId);
    }

    @Override
    public boolean ordenar(UUID estanteId, EstanteEjemplarDTO dto) {
        Estante estante = propio(SecurityUtils.usuarioActual(), estanteId);
        List<EstanteItem> lista = new ArrayList<>(items.findByEstanteIdOrderByOrdenAsc(estante.getId()));
        EstanteItem movido = lista.stream().filter(i -> i.getEjemplarId().equals(dto.getEjemplarId()))
                .findFirst()
                .orElseThrow(() -> new ValidationException(Message.Msj.libroNoEstaEnEstante, CodigoError.NO_ENCONTRADO));
        lista.remove(movido);

        Double nuevo = calcular(lista, dto);
        if (nuevo == null) {
            renumerar(lista);
            nuevo = calcular(lista, dto);
        }
        movido.setOrden(nuevo);
        items.save(movido);
        return true;
    }

    /** Orden nuevo, o null si el hueco es demasiado pequeno y hay que renumerar. */
    static Double calcular(List<EstanteItem> lista, EstanteEjemplarDTO dto) {
        if (dto.getAntesDe() != null) {
            int i = indice(lista, dto.getAntesDe());
            double siguiente = lista.get(i).getOrden();
            double anterior = i == 0 ? siguiente - 2.0 : lista.get(i - 1).getOrden();
            return enMedio(anterior, siguiente);
        }
        if (dto.getDespuesDe() != null) {
            int i = indice(lista, dto.getDespuesDe());
            double anterior = lista.get(i).getOrden();
            double siguiente = i == lista.size() - 1 ? anterior + 2.0 : lista.get(i + 1).getOrden();
            return enMedio(anterior, siguiente);
        }
        return lista.isEmpty() ? 1.0 : Math.floor(lista.get(lista.size() - 1).getOrden()) + 1.0;
    }

    static Double enMedio(double a, double b) {
        if (b - a < HUECO_MINIMO) return null;
        return a + (b - a) / 2.0;
    }

    private void renumerar(List<EstanteItem> lista) {
        log.info("Renumerando un estante de {} libros", lista.size());
        for (int i = 0; i < lista.size(); i++) {
            lista.get(i).setOrden((double) (i + 1));
        }
        items.saveAll(lista);
    }

    private static int indice(List<EstanteItem> lista, UUID ejemplarId) {
        for (int i = 0; i < lista.size(); i++) {
            if (lista.get(i).getEjemplarId().equals(ejemplarId)) return i;
        }
        throw new ValidationException(Message.Msj.referenciaNoEstaEnEstante, CodigoError.NO_ENCONTRADO);
    }

    private Estante propio(Long usuarioId, UUID id) {
        return ValidationUtils.encontrado(estantes.findByIdAndUsuarioId(id, usuarioId), Message.Msj.estanteNoEncontrado);
    }

    private UUID ejemplarPropio(Long usuarioId, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, usuarioId), Message.Msj.libroNoEncontrado)
                .getId();
    }

    private void cambio(Estante e, EntityChangeEvent.Accion accion) {
        eventos.publishEvent(new EntityChangeEvent("Estante", e.getId().toString(), accion, e.getUsuarioId(), e.getNombre()));
    }

    private EstanteDTO aDTO(Estante e) {
        return new EstanteDTO(e.getId(), e.getNombre(), e.getTipo(), e.getColorMadera(), items.contarVisibles(e.getId()));
    }
}
