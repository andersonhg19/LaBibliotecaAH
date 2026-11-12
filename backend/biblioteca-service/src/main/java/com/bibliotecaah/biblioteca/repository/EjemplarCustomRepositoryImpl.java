package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.filter.FiltroCarpetaDTO;
import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetaDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.text.Normalizer;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Filtros, orden y facetas de "Mi Biblioteca" en SQL de PostgreSQL.
 *
 * Los filtros son combinables y todos opcionales: el WHERE se arma con
 * parametros con nombre (nunca concatenando valores del usuario). La busqueda
 * de texto ignora mayusculas y tildes con translate(): no necesita la extension
 * unaccent, que exige permisos de superusuario para instalarse.
 */
public class EjemplarCustomRepositoryImpl implements EjemplarCustomRepository {

    static final String CON_TILDE = "áàäâãéèëêíìïîóòöôõúùüûñç";
    static final String SIN_TILDE = "aaaaaeeeeiiiiooooouuuunc";

    private static final String DESDE = " FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id"
            + " LEFT JOIN bah_lib_archivo a ON a.id = e.archivo_id"
            + " LEFT JOIN bah_lib_progreso pr ON pr.ejemplar_id = e.id AND pr.usuario_id = e.usuario_id";

    private final NamedParameterJdbcTemplate jdbc;

    public EjemplarCustomRepositoryImpl(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Pagina buscar(Long usuarioId, FiltroLibrosDTO f, int page, int size) {
        MapSqlParameterSource p = new MapSqlParameterSource("u", usuarioId);
        StringBuilder where = new StringBuilder(" WHERE e.usuario_id = :u AND e.retirado_en IS NULL");
        where.append(pestana(f.getPestana()));

        if (f.getTexto() != null && !f.getTexto().isBlank()) {
            where.append(" AND ").append(normalizarSql("concat_ws(' ', o.titulo, o.subtitulo, "
                    + "array_to_string(o.autores, ' '), o.editorial, o.sinopsis, array_to_string(o.generos, ' '), "
                    + "array_to_string(e.etiquetas, ' '), o.isbn)")).append(" LIKE :texto");
            p.addValue("texto", "%" + escaparLike(normalizar(f.getTexto().trim())) + "%");
        }
        enLista(where, p, f.getAutores(), "autores", " AND EXISTS (SELECT 1 FROM unnest(o.autores) x WHERE x IN (:autores))");
        /* Generos y etiquetas sin distinguir mayusculas (QA BI-23): "Novela" y
           "novela" son el mismo genero en el filtro y en las facetas. */
        enLista(where, p, minusculas(f.getGeneros()), "generos",
                " AND EXISTS (SELECT 1 FROM unnest(o.generos) x WHERE lower(x) IN (:generos))");
        enLista(where, p, minusculas(f.getEtiquetas()), "etiquetas",
                " AND EXISTS (SELECT 1 FROM unnest(e.etiquetas) x WHERE lower(x) IN (:etiquetas))");
        if (f.getFormatos() != null && !f.getFormatos().isEmpty()) {
            where.append(" AND a.formato_original IN (:formatos)");
            p.addValue("formatos", f.getFormatos().stream().map(s -> s.toUpperCase(Locale.ROOT)).toList());
        }
        if (f.getAnioDesde() != null) {
            where.append(" AND o.anio >= :anioDesde");
            p.addValue("anioDesde", f.getAnioDesde());
        }
        if (f.getAnioHasta() != null) {
            where.append(" AND o.anio <= :anioHasta");
            p.addValue("anioHasta", f.getAnioHasta());
        }
        if (f.getCalificacionMin() != null) {
            where.append(" AND e.calificacion >= :calMin");
            p.addValue("calMin", f.getCalificacionMin());
        }
        if (f.getConNotas() != null) {
            where.append(Boolean.TRUE.equals(f.getConNotas()) ? " AND " : " AND NOT ")
                    .append("EXISTS (SELECT 1 FROM bah_lib_anotacion n WHERE n.ejemplar_id = e.id AND n.usuario_id = :u)");
        }

        Long total = jdbc.queryForObject("SELECT COUNT(*)" + DESDE + where, p, Long.class);
        p.addValue("limite", size).addValue("salto", (long) page * size);
        List<UUID> ids = jdbc.queryForList("SELECT e.id" + DESDE + where + " ORDER BY " + orden(f.getOrden())
                + " LIMIT :limite OFFSET :salto", p, UUID.class);
        return new Pagina(ids, total == null ? 0 : total);
    }

    static String pestana(FiltroLibrosDTO.Pestana pestana) {
        return switch (pestana == null ? FiltroLibrosDTO.Pestana.TODO : pestana) {
            /* QA BI-12: las pestanas de libros son SOLO libros. Los documentos
               personales tienen su pestana (DOCUMENTOS) y los deseos la suya. */
            case LEYENDO -> " AND e.tipo = 'LIBRO' AND e.estado = 'LEYENDO'";
            case POR_LEER -> " AND e.tipo = 'LIBRO' AND e.estado = 'POR_LEER'";
            case LEIDOS -> " AND e.tipo = 'LIBRO' AND e.estado = 'LEIDO'";
            case FAVORITOS -> " AND EXISTS (SELECT 1 FROM bah_lib_estante_item i JOIN bah_lib_estante s "
                    + "ON s.id = i.estante_id WHERE i.ejemplar_id = e.id AND s.usuario_id = :u AND s.tipo = 'FAVORITOS')";
            case DESEOS -> " AND e.tipo = 'DESEO'";
            case DOCUMENTOS -> " AND e.tipo = 'DOCUMENTO'";
            case TODO -> " AND e.tipo = 'LIBRO'";
        };
    }

    static String orden(FiltroLibrosDTO.Orden orden) {
        String criterio = switch (orden == null ? FiltroLibrosDTO.Orden.RECIENTES : orden) {
            case RECIENTES -> "e.fecha_llegada DESC";
            case ANTIGUOS -> "e.fecha_llegada ASC";
            case ULTIMO_ABIERTO -> "e.ultima_apertura DESC NULLS LAST, e.fecha_llegada DESC";
            case TITULO -> "lower(o.titulo) ASC";
            // QA BI-24: por apellido (funcion de V4__orden_por_apellido.sql), no por el nombre de pila.
            case AUTOR -> "bah_clave_autor(o.autores[1]) ASC NULLS LAST, lower(o.autores[1]) ASC, lower(o.titulo) ASC";
            case ANIO -> "o.anio DESC NULLS LAST, lower(o.titulo) ASC";
            case PROGRESO -> "COALESCE(pr.porcentaje, 0) DESC, e.fecha_llegada DESC";
            case CALIFICACION -> "e.calificacion DESC NULLS LAST, lower(o.titulo) ASC";
        };
        /* Desempate estable: sin el, dos libros con la misma clave pueden
           saltar de pagina entre una peticion y la siguiente. */
        return criterio + ", e.id ASC";
    }

    /**
     * Valores de los filtros con su cuenta, para UNA pestana (QA BI-13): la
     * cuenta de cada valor es exactamente cuantos ejemplares da ese filtro en
     * esa pestana. Sin deseos ni documentos en las pestanas de libros, sin
     * retirados, y generos y etiquetas sin distinguir mayusculas (BI-23).
     */
    @Override
    public FacetasDTO facetas(Long usuarioId, FiltroLibrosDTO.Pestana pestana) {
        MapSqlParameterSource p = new MapSqlParameterSource("u", usuarioId);
        String base = " FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id"
                + " LEFT JOIN bah_lib_archivo a ON a.id = e.archivo_id";
        String donde = " WHERE e.usuario_id = :u AND e.retirado_en IS NULL" + pestana(pestana);
        return FacetasDTO.builder()
                .autores(contar("SELECT x AS nombre, COUNT(DISTINCT e.id) AS n" + base + ", unnest(o.autores) x" + donde
                        + " GROUP BY x ORDER BY n DESC, x", p))
                .generos(contar("SELECT min(x COLLATE \"C\") AS nombre, COUNT(DISTINCT e.id) AS n" + base + ", unnest(o.generos) x"
                        + donde + " GROUP BY lower(x) ORDER BY n DESC, min(x COLLATE \"C\")", p))
                .etiquetas(contar("SELECT min(x COLLATE \"C\") AS nombre, COUNT(DISTINCT e.id) AS n" + base + ", unnest(e.etiquetas) x"
                        + donde + " GROUP BY lower(x) ORDER BY n DESC, min(x COLLATE \"C\")", p))
                .anios(contar("SELECT CAST(o.anio AS TEXT) AS nombre, COUNT(*) AS n" + base + donde
                        + " AND o.anio IS NOT NULL GROUP BY o.anio ORDER BY o.anio DESC", p))
                .formatos(contar("SELECT a.formato_original AS nombre, COUNT(*) AS n" + base + donde
                        + " AND a.formato_original IS NOT NULL GROUP BY a.formato_original "
                        + "ORDER BY n DESC, a.formato_original", p))
                .build();
    }

    // ------------------------------------------------------------------ carpetas (v1.6)

    private static final String DOCUMENTOS = " FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id"
            + " WHERE e.usuario_id = :u AND e.retirado_en IS NULL AND e.tipo = 'DOCUMENTO'";

    @Override
    public List<UUID> documentosDeCarpeta(Long usuarioId, UUID carpetaId, FiltroCarpetaDTO.Orden orden, int limite) {
        MapSqlParameterSource p = new MapSqlParameterSource("u", usuarioId).addValue("limite", limite);
        String donde;
        if (carpetaId == null) {
            donde = " AND e.carpeta_id IS NULL";
        } else {
            donde = " AND e.carpeta_id = :c";
            p.addValue("c", carpetaId);
        }
        return jdbc.queryForList("SELECT e.id" + DOCUMENTOS + donde + " ORDER BY " + ordenDocumentos(orden)
                + " LIMIT :limite", p, UUID.class);
    }

    @Override
    public List<UUID> buscarDocumentos(Long usuarioId, Collection<UUID> carpetas, String texto,
                                       FiltroCarpetaDTO.Orden orden, int limite) {
        if (carpetas != null && carpetas.isEmpty()) return List.of();
        MapSqlParameterSource p = new MapSqlParameterSource("u", usuarioId).addValue("limite", limite)
                .addValue("texto", "%" + escaparLike(normalizar(texto.trim())) + "%");
        StringBuilder donde = new StringBuilder(" AND ").append(normalizarSql("concat_ws(' ', o.titulo, o.subtitulo, "
                + "array_to_string(o.autores, ' '), o.sinopsis, array_to_string(e.etiquetas, ' '))")).append(" LIKE :texto");
        if (carpetas != null) {
            donde.append(" AND e.carpeta_id IN (:carpetas)");
            p.addValue("carpetas", carpetas);
        }
        return jdbc.queryForList("SELECT e.id" + DOCUMENTOS + donde + " ORDER BY " + ordenDocumentos(orden)
                + " LIMIT :limite", p, UUID.class);
    }

    @Override
    public Map<UUID, Long> documentosPorCarpeta(Long usuarioId) {
        Map<UUID, Long> cuentas = new HashMap<>();
        jdbc.query("SELECT e.carpeta_id AS c, COUNT(*) AS n FROM bah_lib_ejemplar e WHERE e.usuario_id = :u "
                + "AND e.retirado_en IS NULL AND e.tipo = 'DOCUMENTO' GROUP BY e.carpeta_id",
                new MapSqlParameterSource("u", usuarioId),
                rs -> {
                    cuentas.put(rs.getObject("c", UUID.class), rs.getLong("n"));
                });
        return cuentas;
    }

    @Override
    public List<UUID> documentosEn(Long usuarioId, Collection<UUID> carpetas) {
        if (carpetas.isEmpty()) return List.of();
        return jdbc.queryForList("SELECT e.id FROM bah_lib_ejemplar e WHERE e.usuario_id = :u AND e.retirado_en IS NULL "
                + "AND e.tipo = 'DOCUMENTO' AND e.carpeta_id IN (:carpetas)",
                new MapSqlParameterSource("u", usuarioId).addValue("carpetas", carpetas), UUID.class);
    }

    @Override
    public int moverDocumentos(Long usuarioId, Collection<UUID> ejemplarIds, UUID carpetaId) {
        if (ejemplarIds.isEmpty()) return 0;
        return jdbc.update("UPDATE bah_lib_ejemplar SET carpeta_id = :c, last_update = now(), id_modified_by = :u "
                + "WHERE usuario_id = :u AND retirado_en IS NULL AND tipo = 'DOCUMENTO' AND id IN (:ids)",
                new MapSqlParameterSource("u", usuarioId).addValue("c", carpetaId).addValue("ids", ejemplarIds));
    }

    static String ordenDocumentos(FiltroCarpetaDTO.Orden orden) {
        return switch (orden == null ? FiltroCarpetaDTO.Orden.NOMBRE : orden) {
            case NOMBRE -> "lower(o.titulo) ASC, e.id ASC";
            case RECIENTES -> "e.fecha_llegada DESC, e.id ASC";
            case ANTIGUOS -> "e.fecha_llegada ASC, e.id ASC";
        };
    }

    private List<FacetaDTO> contar(String sql, MapSqlParameterSource p) {
        return jdbc.query(sql, p, (rs, i) -> new FacetaDTO(rs.getString("nombre"), rs.getLong("n")));
    }

    private static List<String> minusculas(List<String> valores) {
        return valores == null ? null : valores.stream().filter(java.util.Objects::nonNull)
                .map(v -> v.toLowerCase(Locale.ROOT)).toList();
    }

    private static void enLista(StringBuilder where, MapSqlParameterSource p, List<String> valores,
                                String nombre, String condicion) {
        if (valores != null && !valores.isEmpty()) {
            where.append(condicion);
            p.addValue(nombre, valores);
        }
    }

    static String normalizarSql(String expresion) {
        return "translate(lower(" + expresion + "), '" + CON_TILDE + "', '" + SIN_TILDE + "')";
    }

    static String normalizar(String texto) {
        return Normalizer.normalize(texto.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    static String escaparLike(String texto) {
        return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
