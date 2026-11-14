package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.CapituloDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.CapituloVozRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.service.CapituloVozService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Preferencias de voz por capitulo (contrato C3). La estructura dice que va en
 * voz por defecto (v2: el cuerpo si, lo de antes y despues no; v1: todo); el
 * usuario puede cambiar cada capitulo y la web salta los que no van al
 * escuchar de corrido. Ejemplar ajeno o retirado: 102 como en el resto.
 */
@Slf4j
@Service
public class CapituloVozServiceImpl implements CapituloVozService {

    private final EjemplarRepository ejemplares;
    private final CapituloVozRepository preferencias;
    private final LectorDeEstructura estructura;

    public CapituloVozServiceImpl(EjemplarRepository ejemplares, CapituloVozRepository preferencias,
                                  LectorDeEstructura estructura) {
        this.ejemplares = ejemplares;
        this.preferencias = preferencias;
        this.estructura = estructura;
    }

    @Override
    public List<CapituloDTO> capitulos(Long usuarioId, Ejemplar ejemplar) {
        Archivo a = ejemplar.getArchivo();
        List<CapituloDTO> lista = estructura.capitulos(a == null ? null : a.getId());
        if (lista.isEmpty()) return lista;
        Map<Integer, Boolean> prefs = preferencias.deEjemplar(usuarioId, ejemplar.getId());
        for (CapituloDTO c : lista) {
            Boolean elegido = prefs.get(c.getIndice());
            c.setEnVoz(elegido == null ? c.isEnVozPorDefecto() : elegido);
        }
        return lista;
    }

    @Override
    @Transactional
    public CapituloDTO cambiar(UUID ejemplarId, int indice, Boolean enVoz) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, ejemplarId);
        List<CapituloDTO> lista = conCapitulos(e);
        CapituloDTO capitulo = lista.stream().filter(c -> c.getIndice() == indice).findFirst().orElse(null);
        ValidationUtils.exigir(capitulo != null, Message.Msj.capituloFueraDeRango, CodigoError.DATO_INVALIDO,
                lista.size(), Math.max(lista.size() - 1, 0));
        preferencias.guardar(yo, e.getId(), indice, enVoz);
        capitulo.setEnVoz(enVoz == null ? capitulo.isEnVozPorDefecto() : enVoz);
        log.info("Capitulo {} del ejemplar {}: enVoz={} (usuario {})", indice, e.getId(), enVoz, yo);
        return capitulo;
    }

    @Override
    @Transactional
    public List<CapituloDTO> soloHistoria(UUID ejemplarId, boolean soloHistoria) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = propio(yo, ejemplarId);
        conCapitulos(e);
        Map<Integer, Boolean> nuevas = new LinkedHashMap<>();
        if (soloHistoria) {
            /* Sin region (libro v1, aun sin reclasificar) todo cuenta como historia. */
            for (CapituloDTO c : estructura.capitulos(e.getArchivo().getId())) {
                nuevas.put(c.getIndice(), c.getRegion() == null || LectorDeEstructura.CUERPO.equals(c.getRegion()));
            }
        }
        preferencias.reemplazar(yo, e.getId(), nuevas);
        log.info("Ejemplar {}: solo la historia en voz = {} (usuario {})", e.getId(), soloHistoria, yo);
        return capitulos(yo, e);
    }

    private Ejemplar propio(Long yo, UUID ejemplarId) {
        return ValidationUtils.encontrado(ejemplares.delUsuario(ejemplarId, yo), Message.Msj.libroNoEncontrado);
    }

    /** El ejemplar debe tener archivo con capitulos; si no, 120 (sin archivo o sin capitulos legibles). */
    private List<CapituloDTO> conCapitulos(Ejemplar e) {
        ValidationUtils.exigir(e.getArchivo() != null, Message.Msj.libroSinArchivo, CodigoError.DATO_INVALIDO);
        List<CapituloDTO> lista = capitulos(e.getUsuarioId(), e);
        ValidationUtils.exigir(!lista.isEmpty(), Message.Msj.capitulosNoDisponibles, CodigoError.DATO_INVALIDO);
        return lista;
    }
}
