package com.bibliotecaah.biblioteca.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;

/**
 * Topes configurables (QA SE-07): que nadie llene el disco ni la base con una
 * sola cuenta. Los de longitud de textos viven en las anotaciones @Size de los
 * DTO (contratos.md §9, "Limites"); estos dependen del despliegue y van por
 * variable de entorno.
 *
 * Setters solo para las pruebas.
 */
@Getter
@Setter
@Component
public class Topes {

    /** Archivos por peticion de subida (BIBLIOTECA_MAX_ARCHIVOS_POR_SUBIDA). */
    private int archivosPorSubida;

    /** Espacio libre que debe quedar en /datos DESPUES de la subida (BIBLIOTECA_ESPACIO_MINIMO_MB). */
    private long espacioLibreMinimoBytes;

    /** Colecciones por usuario, sin contar Favoritos (BIBLIOTECA_MAX_ESTANTES). */
    private int estantesPorUsuario;

    /** (v1.6) Carpetas del archivador por usuario (BIBLIOTECA_MAX_CARPETAS). */
    private int carpetasPorUsuario;

    /** Para los mensajes: lo que ya hace cumplir Tomcat (spring.servlet.multipart.*). */
    private DataSize maxArchivo;
    private DataSize maxSubida;

    public Topes(@Value("${biblioteca.limites.archivos-por-subida:20}") int archivosPorSubida,
                 @Value("${biblioteca.limites.espacio-libre-minimo-mb:1024}") long espacioLibreMinimoMb,
                 @Value("${biblioteca.limites.estantes-por-usuario:100}") int estantesPorUsuario,
                 @Value("${biblioteca.limites.carpetas-por-usuario:500}") int carpetasPorUsuario,
                 @Value("${spring.servlet.multipart.max-file-size:300MB}") DataSize maxArchivo,
                 @Value("${spring.servlet.multipart.max-request-size:1GB}") DataSize maxSubida) {
        this.archivosPorSubida = archivosPorSubida;
        this.espacioLibreMinimoBytes = DataSize.ofMegabytes(espacioLibreMinimoMb).toBytes();
        this.estantesPorUsuario = estantesPorUsuario;
        this.carpetasPorUsuario = carpetasPorUsuario;
        this.maxArchivo = maxArchivo;
        this.maxSubida = maxSubida;
    }

    /** "300 MB", "1 GB": como lo lee una persona. */
    public static String legible(DataSize tamano) {
        long bytes = tamano.toBytes();
        if (bytes >= DataSize.ofGigabytes(1).toBytes() && bytes % DataSize.ofGigabytes(1).toBytes() == 0) {
            return tamano.toGigabytes() + " GB";
        }
        return tamano.toMegabytes() + " MB";
    }
}
