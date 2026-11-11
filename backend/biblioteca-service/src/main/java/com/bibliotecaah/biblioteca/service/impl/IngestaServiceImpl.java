package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.output.EjemplarDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.entity.Obra;
import com.bibliotecaah.biblioteca.enums.EstadoLectura;
import com.bibliotecaah.biblioteca.enums.Formato;
import com.bibliotecaah.biblioteca.enums.FuenteMetadatos;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.event.EntityChangeEvent;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.repository.ArchivoRepository;
import com.bibliotecaah.biblioteca.repository.EjemplarRepository;
import com.bibliotecaah.biblioteca.repository.ObraRepository;
import com.bibliotecaah.biblioteca.repository.TrabajoRepository;
import com.bibliotecaah.biblioteca.service.IngestaService;
import com.bibliotecaah.biblioteca.util.AlmacenDeArchivos;
import com.bibliotecaah.biblioteca.util.CodigoError;
import com.bibliotecaah.biblioteca.util.DetectorDeFormato;
import com.bibliotecaah.biblioteca.util.Mensajes;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.UUID;

/**
 * 1. Copia EN STREAMING a /datos/tmp calculando el sha256 a la vez: un
 *    fichero de 300 MB nunca esta entero en memoria.
 * 2. Comprueba el formato por extension y por sus primeros bytes.
 * 3. Si el sha256 ya existe reutiliza el archivo (borra la copia temporal);
 *    si no, lo mueve a /datos/originales/{archivoId}/{saneado} y encola CONVERTIR.
 * 4. Si el usuario ya tiene un ejemplar de ese archivo devuelve ese; si no,
 *    crea obra (titulo provisional del nombre del fichero) + ejemplar.
 */
@Slf4j
@Service
public class IngestaServiceImpl implements IngestaService {

    private final AlmacenDeArchivos almacen;
    private final ArchivoRepository archivos;
    private final ObraRepository obras;
    private final EjemplarRepository ejemplares;
    private final TrabajoRepository trabajos;
    private final TareaMetadatos metadatos;
    private final EnsambladorDeEjemplares ensamblador;
    private final TransactionTemplate tx;
    private final Mensajes mensajes;
    private final ApplicationEventPublisher eventos;

    public IngestaServiceImpl(AlmacenDeArchivos almacen, ArchivoRepository archivos, ObraRepository obras,
                              EjemplarRepository ejemplares, TrabajoRepository trabajos, TareaMetadatos metadatos,
                              EnsambladorDeEjemplares ensamblador, TransactionTemplate tx, Mensajes mensajes,
                              ApplicationEventPublisher eventos) {
        this.almacen = almacen;
        this.archivos = archivos;
        this.obras = obras;
        this.ejemplares = ejemplares;
        this.trabajos = trabajos;
        this.metadatos = metadatos;
        this.ensamblador = ensamblador;
        this.tx = tx;
        this.mensajes = mensajes;
        this.eventos = eventos;
    }

    @Override
    public Resultado ingerir(Long usuarioId, String nombreOriginal, InputStream contenido, TipoEjemplar tipo)
            throws IOException {
        almacen.exigirDisponible();
        String nombre = (nombreOriginal == null || nombreOriginal.isBlank()) ? "archivo" : nombreOriginal;
        Formato formato = DetectorDeFormato.porExtension(nombre);
        if (formato == null) {
            return rechazo(Message.Msj.formatoNoSoportado, nombre);
        }

        Path temporal = almacen.temporal();
        try {
            String sha256 = copiarCalculandoHash(contenido, temporal);
            long tamano = Files.size(temporal);
            if (tamano == 0) {
                return rechazo(Message.Msj.archivoVacio, nombre);
            }
            if (!DetectorDeFormato.coincide(formato, temporal)) {
                return rechazo(Message.Msj.formatoNoCoincide, nombre, formato.name());
            }
            TipoEjemplar tipoFinal = tipo == TipoEjemplar.DOCUMENTO ? TipoEjemplar.DOCUMENTO : TipoEjemplar.LIBRO;
            EjemplarDTO dto = tx.execute(s -> registrar(usuarioId, nombre, formato, sha256, tamano, temporal, tipoFinal));
            return new Resultado(dto, null);
        } finally {
            Files.deleteIfExists(temporal);
        }
    }

    private Resultado rechazo(Message.Msj clave, Object... argumentos) {
        String motivo = mensajes.texto(clave, argumentos);
        log.info("Archivo rechazado: {}", motivo);
        return new Resultado(null, motivo);
    }

    private EjemplarDTO registrar(Long usuarioId, String nombre, Formato formato, String sha256, long tamano,
                                  Path temporal, TipoEjemplar tipo) {
        Archivo archivo = archivos.findBySha256(sha256).orElse(null);
        if (archivo == null) {
            archivo = nuevoArchivo(nombre, formato, sha256, tamano, temporal);
        } else {
            log.info("Archivo duplicado (sha256 {}): se reutiliza {}", sha256, archivo.getId());
            if (Archivo.ERROR.equals(archivo.getEstadoConversion())) {
                /* Si la conversion habia fallado, subirlo otra vez es pedir que se reintente. */
                archivo.setEstadoConversion(Archivo.PENDIENTE);
                archivo.setErrorConversion(null);
                archivos.save(archivo);
                trabajos.encolarConversion(archivo.getId());
            }
            Ejemplar existente = ejemplares.delUsuarioPorArchivo(usuarioId, archivo.getId()).orElse(null);
            if (existente != null) {
                return ensamblador.uno(usuarioId, existente);
            }
        }

        Obra obra = Obra.builder()
                .id(UUID.randomUUID())
                .titulo(tituloDesdeNombre(nombre))
                .autores(new ArrayList<>())
                .generos(new ArrayList<>())
                .fuenteMetadatos(FuenteMetadatos.NOMBRE_ARCHIVO)
                .build();
        if (Archivo.LISTO.equals(archivo.getEstadoConversion())) {
            metadatos.aplicar(obra, trabajos.metadatosDe(archivo.getId()));
        }
        obras.save(obra);

        Ejemplar ejemplar = Ejemplar.builder()
                .id(UUID.randomUUID())
                .usuarioId(usuarioId)
                .obra(obra)
                .archivo(archivo)
                .tipo(tipo)
                .estado(EstadoLectura.POR_LEER)
                .fechaLlegada(Instant.now())
                .etiquetas(new ArrayList<>())
                .build();
        ejemplares.save(ejemplar);
        eventos.publishEvent(new EntityChangeEvent("Ejemplar", ejemplar.getId().toString(),
                EntityChangeEvent.Accion.CREAR, usuarioId, nombre));
        log.info("Usuario {} recibio \"{}\" (ejemplar {})", usuarioId, nombre, ejemplar.getId());
        return ensamblador.uno(usuarioId, ejemplar);
    }

    private Archivo nuevoArchivo(String nombre, Formato formato, String sha256, long tamano, Path temporal) {
        UUID id = UUID.randomUUID();
        Path carpeta = almacen.carpetaOriginal(id);
        Path destino = carpeta.resolve(AlmacenDeArchivos.sanear(nombre));
        try {
            Files.createDirectories(carpeta);
            Files.move(temporal, destino, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error("No se pudo guardar el original de {} en {}", nombre, destino, e);
            throw new ValidationException(Message.Msj.originalNoGuardado, CodigoError.ERROR_DE_PROCESO, nombre);
        }
        Archivo archivo = Archivo.builder()
                .id(id)
                .sha256(sha256)
                .formatoOriginal(formato)
                .rutaOriginal(almacen.raiz().relativize(destino).toString().replace('\\', '/'))
                .nombreOriginal(nombre.length() > 500 ? nombre.substring(0, 500) : nombre)
                .tamano(tamano)
                .estadoConversion(Archivo.PENDIENTE)
                .tienePortada(false)
                .metadatosAplicados(false)
                .build();
        archivos.save(archivo);
        trabajos.encolarConversion(id);
        return archivo;
    }

    static String copiarCalculandoHash(InputStream in, Path destino) throws IOException {
        MessageDigest sha = sha256();
        try (OutputStream out = new DigestOutputStream(Files.newOutputStream(destino), sha)) {
            in.transferTo(out);
        }
        return HexFormat.of().formatHex(sha.digest());
    }

    static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("La JVM no tiene SHA-256", e);
        }
    }

    /** "el_nombre-del.viento.epub" -> "el nombre del viento". */
    static String tituloDesdeNombre(String nombre) {
        String base = nombre;
        int barra = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        if (barra >= 0) base = base.substring(barra + 1);
        int punto = base.lastIndexOf('.');
        if (punto > 0) base = base.substring(0, punto);
        base = base.replaceAll("[_.\\-]+", " ").replaceAll("\\s+", " ").trim();
        if (base.isEmpty()) base = "Sin titulo";
        return base.length() > 500 ? base.substring(0, 500) : base;
    }
}
