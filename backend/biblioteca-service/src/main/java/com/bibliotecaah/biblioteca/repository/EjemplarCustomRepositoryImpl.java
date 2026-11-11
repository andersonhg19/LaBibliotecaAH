package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.dto.filter.FiltroLibrosDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetaDTO;
import com.bibliotecaah.biblioteca.dto.output.FacetasDTO;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
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
        StringBuilder where = new StringBuilder(" WHERE e.usuario_id = :u");
        where.append(pestana(f.getPestana()));

        if (f.getTexto() != null && !f.getTexto().isBlank()) {
            where.append(" AND ").append(normalizarSql("concat_ws(' ', o.titulo, o.subtitulo, "
                    + "array_to_string(o.autores, ' '), o.editorial, o.sinopsis, array_to_string(o.generos, ' '), "
                    + "array_to_string(e.etiquetas, ' '), o.isbn)")).append(" LIKE :texto");
            p.addValue("texto", "%" + escaparLike(normalizar(f.getTexto().trim())) + "%");
        }
        enLista(where, p, f.getAutores(), "autores", " AND EXISTS (SELECT 1 FROM unnest(o.autores) x WHERE x IN (:autores))");
        enLista(where, p, f.getGeneros(), "generos", " AND EXISTS (SELECT 1 FROM unnest(o.generos) x WHERE x IN (:generos))");
        enLista(where, p, f.getEtiquetas(), "etiquetas", " AND EXISTS (SELECT 1 FROM unnest(e.etiquetas) x WHERE x IN (:etiquetas))");
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
            case LEYENDO -> " AND e.tipo <> 'DESEO' AND e.estado = 'LEYENDO'";
            case POR_LEER -> " AND e.tipo <> 'DESEO' AND e.estado = 'POR_LEER'";
            case LEIDOS -> " AND e.tipo <> 'DESEO' AND e.estado = 'LEIDO'";
            case FAVORITOS -> " AND EXISTS (SELECT 1 FROM bah_lib_estante_item i JOIN bah_lib_estante s "
                    + "ON s.id = i.estante_id WHERE i.ejemplar_id = e.id AND s.usuario_id = :u AND s.tipo = 'FAVORITOS')";
            case DESEOS -> " AND e.tipo = 'DESEO'";
            case DOCUMENTOS -> " AND e.tipo = 'DOCUMENTO'";
            case TODO -> " AND e.tipo <> 'DESEO'";
        };
    }

    static String orden(FiltroLibrosDTO.Orden orden) {
        String criterio = switch (orden == null ? FiltroLibrosDTO.Orden.RECIENTES : orden) {
            case RECIENTES -> "e.fecha_llegada DESC";
            case ANTIGUOS -> "e.fecha_llegada ASC";
            case ULTIMO_ABIERTO -> "e.ultima_apertura DESC NULLS LAST, e.fecha_llegada DESC";
            case TITULO -> "lower(o.titulo) ASC";
            case AUTOR -> "lower(o.autores[1]) ASC NULLS LAST, lower(o.titulo) ASC";
            case ANIO -> "o.anio DESC NULLS LAST, lower(o.titulo) ASC";
            case PROGRESO -> "COALESCE(pr.porcentaje, 0) DESC, e.fecha_llegada DESC";
            case CALIFICACION -> "e.calificacion DESC NULLS LAST, lower(o.titulo) ASC";
        };
        /* Desempate estable: sin el, dos libros con la misma clave pueden
           saltar de pagina entre una peticion y la siguiente. */
        return criterio + ", e.id ASC";
    }

    @Override
    public FacetasDTO facetas(Long usuarioId) {
        MapSqlParameterSource p = new MapSqlParameterSource("u", usuarioId);
        String base = " FROM bah_lib_ejemplar e JOIN bah_lib_obra o ON o.id = e.obra_id"
                + " LEFT JOIN bah_lib_archivo a ON a.id = e.archivo_id";
        String donde = " WHERE e.usuario_id = :u";
        return FacetasDTO.builder()
                .autores(contar("SELECT x AS nombre, COUNT(*) AS n" + base + ", unnest(o.autores) x" + donde
                        + " GROUP BY x ORDER BY n DESC, x", p))
                .generos(contar("SELECT x AS nombre, COUNT(*) AS n" + base + ", unnest(o.generos) x" + donde
                        + " GROUP BY x ORDER BY n DESC, x", p))
                .etiquetas(contar("SELECT x AS nombre, COUNT(*) AS n" + base + ", unnest(e.etiquetas) x" + donde
                        + " GROUP BY x ORDER BY n DESC, x", p))
                .anios(contar("SELECT CAST(o.anio AS TEXT) AS nombre, COUNT(*) AS n" + base + donde
                        + " AND o.anio IS NOT NULL GROUP BY o.anio ORDER BY o.anio DESC", p))
                .formatos(contar("SELECT a.formato_original AS nombre, COUNT(*) AS n" + base + donde
                        + " AND a.formato_original IS NOT NULL GROUP BY a.formato_original "
                        + "ORDER BY n DESC, a.formato_original", p))
                .build();
    }

    private List<FacetaDTO> contar(String sql, MapSqlParameterSource p) {
        return jdbc.query(sql, p, (rs, i) -> new FacetaDTO(rs.getString("nombre"), rs.getLong("n")));
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
