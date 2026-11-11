package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * V5 — Correos guardados recortados y en minusculas (QA SE-04).
 *
 * Hasta aqui el correo se guardaba tal cual llegaba y la restriccion UNIQUE
 * distinguia mayusculas: "Ana@x" y "ana@x" podian ser dos cuentas. Desde V5 el
 * codigo normaliza (trim + minusculas) al registrar, editar e iniciar sesion, y
 * esta migracion pone al dia las cuentas que ya existen.
 *
 * QUE HACE
 *  1. Agrupa las cuentas por su correo normalizado.
 *  2. Si el grupo tiene UNA cuenta, la normaliza.
 *  3. Si tiene VARIAS ("gemelas" que solo difieren en mayusculas o espacios),
 *     NO las toca ni las fusiona: lo deja escrito en el log (WARN) con sus ids
 *     para que una persona decida. Fusionar cuentas a ciegas mezclaria
 *     bibliotecas de dos personas.
 *  4. En PostgreSQL, si no quedo ningun grupo repetido, crea el indice unico
 *     sobre lower(email): desde ese momento la base tampoco admite gemelas. Si
 *     quedaron, el indice no se crea (crearlo fallaria y el servicio no
 *     arrancaria) y el WARN lo dice; el codigo sigue impidiendo gemelas nuevas.
 *
 * Es una migracion en Java y no SQL porque tiene que correr igual en H2 (las
 * pruebas) y en PostgreSQL, y "reportar en vez de fusionar" necesita un log
 * que el SQL portable no tiene.
 */
public class V5__correos_en_minusculas extends BaseJavaMigration {

    private static final Logger log = LoggerFactory.getLogger(V5__correos_en_minusculas.class);

    static final String INDICE = "ux_bah_auth_user_email_lower";

    @Override
    public void migrate(Context context) throws Exception {
        normalizar(context.getConnection());
    }

    /** Devuelve los grupos de cuentas gemelas que no se tocaron (vacio si no hubo). */
    static List<List<Long>> normalizar(Connection conexion) throws SQLException {
        Map<String, List<Object[]>> porCorreo = new LinkedHashMap<>();
        try (Statement st = conexion.createStatement();
             ResultSet rs = st.executeQuery("SELECT id, email FROM bah_auth_user ORDER BY id")) {
            while (rs.next()) {
                String email = rs.getString(2);
                porCorreo.computeIfAbsent(normalizado(email), k -> new ArrayList<>())
                        .add(new Object[]{rs.getLong(1), email});
            }
        }

        List<List<Long>> gemelas = new ArrayList<>();
        int normalizadas = 0;
        try (PreparedStatement up = conexion.prepareStatement("UPDATE bah_auth_user SET email = ? WHERE id = ?")) {
            for (Map.Entry<String, List<Object[]>> grupo : porCorreo.entrySet()) {
                List<Object[]> cuentas = grupo.getValue();
                if (cuentas.size() > 1) {
                    List<Long> ids = cuentas.stream().map(c -> (Long) c[0]).toList();
                    gemelas.add(ids);
                    log.warn("V5: las cuentas {} tienen el mismo correo salvo mayusculas/espacios ({}). "
                            + "No se fusionan: revisalas a mano desde Administracion.", ids, grupo.getKey());
                    continue;
                }
                Object[] cuenta = cuentas.get(0);
                if (!grupo.getKey().equals(cuenta[1])) {
                    up.setString(1, grupo.getKey());
                    up.setLong(2, (Long) cuenta[0]);
                    up.executeUpdate();
                    normalizadas++;
                }
            }
        }
        log.info("V5: {} correo(s) normalizado(s), {} grupo(s) de cuentas gemelas sin tocar", normalizadas, gemelas.size());

        if (esPostgres(conexion)) {
            if (gemelas.isEmpty()) {
                try (Statement st = conexion.createStatement()) {
                    st.execute("CREATE UNIQUE INDEX IF NOT EXISTS " + INDICE + " ON bah_auth_user (lower(email))");
                }
            } else {
                log.warn("V5: no se crea el indice unico {} porque quedan cuentas gemelas", INDICE);
            }
        }
        return gemelas;
    }

    static String normalizado(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    static boolean esPostgres(Connection conexion) throws SQLException {
        return conexion.getMetaData().getDatabaseProductName().toLowerCase(Locale.ROOT).contains("postgres");
    }
}
