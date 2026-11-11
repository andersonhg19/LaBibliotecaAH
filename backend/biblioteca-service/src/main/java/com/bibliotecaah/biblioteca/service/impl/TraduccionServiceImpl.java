package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.client.TraductorClient;
import com.bibliotecaah.biblioteca.dto.input.TraducirCapituloDTO;
import com.bibliotecaah.biblioteca.dto.input.TraducirDTO;
import com.bibliotecaah.biblioteca.dto.output.CapituloTraducidoDTO;
import com.bibliotecaah.biblioteca.dto.output.TraduccionDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.TraduccionRepository;
import com.bibliotecaah.biblioteca.service.TraduccionService;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.LimitadorPorUsuario;
import com.bibliotecaah.biblioteca.util.SecurityUtils;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Traduccion con el traductor autoalojado (contratos v1.3). Ningun texto sale de casa.
 *
 *  · Textos sueltos (1-5000 caracteres): cache en bah_lib_traduccion por sha256 de
 *    origen|destino|texto, compartida y sin usuario. Solo lo que NO esta en cache cuenta para
 *    el freno de caracteres por minuto.
 *  · Capitulos: los del ejemplar del usuario (otro usuario = 102, como todo lo ajeno). El
 *    trabajo lo hace {@link TraductorDeCapitulos}; aqui se comprueba la propiedad, el estado del
 *    libro y el freno de capitulos nuevos por hora.
 */
@Slf4j
@Service
public class TraduccionServiceImpl implements TraduccionService {

    static final String AUTO = "auto";
    static final String DESTINO_POR_DEFECTO = "es";

    private final EjemplarRepository ejemplares;
    private final TraduccionRepository cache;
    private final TraductorClient traductor;
    private final TraductorDeCapitulos capitulos;
    private final List<String> idiomas;
    private final LimitadorPorUsuario caracteres;
    private final LimitadorPorUsuario capitulosNuevos;

    @Autowired
    public TraduccionServiceImpl(EjemplarRepository ejemplares, TraduccionRepository cache, TraductorClient traductor,
                                 TraductorDeCapitulos capitulos,
                                 @Value("${biblioteca.traductor.idiomas:en,es}") String idiomas,
                                 @Value("${biblioteca.traductor.caracteres-por-minuto:20000}") long porMinuto,
                                 @Value("${biblioteca.traductor.capitulos-por-hora:30}") long porHora) {
        this(ejemplares, cache, traductor, capitulos, idiomas,
                new LimitadorPorUsuario(porMinuto, Duration.ofMinutes(1), Clock.systemUTC()),
                new LimitadorPorUsuario(porHora, Duration.ofHours(1), Clock.systemUTC()));
    }

    TraduccionServiceImpl(EjemplarRepository ejemplares, TraduccionRepository cache, TraductorClient traductor,
                          TraductorDeCapitulos capitulos, String idiomas, LimitadorPorUsuario caracteres,
                          LimitadorPorUsuario capitulosNuevos) {
        this.ejemplares = ejemplares;
        this.cache = cache;
        this.traductor = traductor;
        this.capitulos = capitulos;
        this.idiomas = Arrays.stream(idiomas.split(","))
                .map(i -> i.trim().toLowerCase(Locale.ROOT)).filter(i -> !i.isEmpty()).distinct().toList();
        this.caracteres = caracteres;
        this.capitulosNuevos = capitulosNuevos;
    }

    @Override
    public TraduccionDTO traducir(TraducirDTO peticion) {
        Long yo = SecurityUtils.usuarioActual();
        String origen = idioma(peticion.getOrigen(), AUTO, true);
        String destino = idioma(peticion.getDestino(), DESTINO_POR_DEFECTO, false);
        ValidationUtils.exigir(!origen.equals(destino), Message.Msj.mismoIdioma, CodigoError.DATO_INVALIDO, destino);
        String texto = peticion.getTexto();
        String hash = TraductorDeCapitulos.sha256((origen + "|" + destino + "|" + texto).getBytes(StandardCharsets.UTF_8));

        Optional<TraduccionRepository.Guardada> guardada = cache.buscar(hash);
        if (guardada.isPresent()) {
            return new TraduccionDTO(guardada.get().traduccion(), guardada.get().origenDetectado());
        }
        ValidationUtils.exigir(caracteres.consumir(yo, texto.length()), Message.Msj.demasiadoTextoTraducido,
                CodigoError.DEMASIADAS_PETICIONES, String.valueOf(caracteres.capacidad()));

        TraductorClient.Lote lote = traductor.traducir(List.of(texto), origen, destino);
        String detectado = AUTO.equals(origen) ? lote.origenDetectado() : origen;
        String traduccion = lote.traducciones().get(0);
        cache.guardar(hash, origen, destino, traduccion, detectado);
        return new TraduccionDTO(traduccion, detectado);
    }

    @Override
    public CapituloTraducidoDTO capitulo(TraducirCapituloDTO peticion) {
        Long yo = SecurityUtils.usuarioActual();
        Ejemplar e = ValidationUtils.encontrado(ejemplares.delUsuario(peticion.getEjemplarId(), yo),
                Message.Msj.libroNoEncontrado);
        Archivo a = e.getArchivo();
        ValidationUtils.exigir(a != null, Message.Msj.libroSinArchivo, CodigoError.DATO_INVALIDO);
        ValidationUtils.exigir(Archivo.LISTO.equals(a.getEstadoConversion()), Message.Msj.libroAunSinConvertir,
                CodigoError.DATO_INVALIDO);
        String destino = idioma(peticion.getDestino(), DESTINO_POR_DEFECTO, false);
        int capitulo = peticion.getCapitulo();
        Integer total = a.getNCapitulos();
        if (total != null) {
            ValidationUtils.exigir(capitulo < total, Message.Msj.capituloFueraDeRango, CodigoError.DATO_INVALIDO,
                    total, Math.max(total - 1, 0));
        }
        // QA NU-02: el idioma del libro puede venir de un taller que antes inventaba "es". Si es desconocido o
        // coincide con el destino, se traduce con "auto" y el 120 mismoIdioma solo sale si el traductor detecta
        // que el texto del propio capitulo ya esta en el destino (TraductorDeCapitulos).
        String delLibro = origenDelLibro(e.getObra() == null ? null : e.getObra().getIdioma());
        String origen = delLibro.equals(destino) ? AUTO : delLibro;
        UUID archivoId = a.getId();
        return capitulos.consultar(archivoId, capitulo, origen, destino,
                Boolean.TRUE.equals(peticion.getReintentar()),
                () -> ValidationUtils.exigir(capitulosNuevos.consumir(yo, 1), Message.Msj.demasiadosCapitulosTraducidos,
                        CodigoError.DEMASIADAS_PETICIONES, String.valueOf(capitulosNuevos.capacidad())));
    }

    /** El idioma del libro si es uno de los cargados ("en-US" -> "en"); si no se sabe, "auto". */
    String origenDelLibro(String idiomaDelLibro) {
        if (idiomaDelLibro == null || idiomaDelLibro.length() < 2) return AUTO;
        String corto = idiomaDelLibro.substring(0, 2).toLowerCase(Locale.ROOT);
        return idiomas.contains(corto) ? corto : AUTO;
    }

    private String idioma(String valor, String porDefecto, boolean admiteAuto) {
        String idioma = valor == null || valor.isBlank() ? porDefecto : valor.trim().toLowerCase(Locale.ROOT);
        boolean valido = idiomas.contains(idioma) || (admiteAuto && AUTO.equals(idioma));
        if (!valido) {
            String admitidos = (admiteAuto ? AUTO + ", " : "") + String.join(", ", idiomas);
            ValidationUtils.exigir(false, Message.Msj.idiomaNoSoportado, CodigoError.DATO_INVALIDO,
                    idioma, admitidos);
        }
        return idioma;
    }
}
