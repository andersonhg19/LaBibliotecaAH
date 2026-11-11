package com.bibliotecaah.biblioteca;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Date;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * ============================================================================
 * UN POSTGRESQL DE VERDAD PARA LAS PRUEBAS DE INTEGRACION
 * ============================================================================
 *
 * biblioteca-service usa JSONB, text[], indices parciales y SQL de PostgreSQL
 * que H2 no entiende, asi que TODAS sus pruebas de integracion corren contra
 * postgres:14 (la imagen del docker-compose) con las migraciones de Flyway
 * reales y ddl-auto=validate.
 *
 * Un solo contenedor por JVM (bloque estatico, sin @Container) y un solo
 * contexto de Spring para todas las clases que heredan de aqui (misma
 * configuracion = contexto cacheado). Cada prueba empieza con las tablas vacias
 * y la carpeta /datos limpia.
 *
 * Sin Docker, estas clases quedan en "skipped" en vez de fallar.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
@AutoConfigureMockMvc
public abstract class PostgresDeVerdad {

    public static final String SECRETO = "secreto-de-pruebas";
    public static final long ANDERSON = 1L;
    public static final long SAMY = 2L;

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:14");

    protected static final Path DATOS;

    /** LibreTranslate de mentira (contratos v1.3): uno por JVM, como el PostgreSQL. */
    protected static final TraductorFalso TRADUCTOR = TraductorFalso.arrancar();

    static {
        if (DockerClientFactory.instance().isDockerAvailable()) {
            POSTGRES.start();
        }
        try {
            DATOS = Files.createTempDirectory("bah-datos-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void propiedades(DynamicPropertyRegistry r) {
        r.add("biblioteca.datos", DATOS::toString);
        r.add("biblioteca.traductor.url", TRADUCTOR::url);
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected ObjectMapper json;

    @BeforeEach
    protected void limpiarTodo() throws IOException {
        jdbc.execute("TRUNCATE bah_lib_estante_item, bah_lib_estante, bah_lib_progreso, bah_lib_anotacion, "
                + "bah_lib_comentario, bah_lib_ejemplar, bah_lib_obra, bah_lib_archivo, bah_lib_trabajo, "
                + "bah_lib_audio, bah_lib_cambio, bah_lib_traduccion CASCADE");
        TRADUCTOR.reiniciar();
        borrar(DATOS);
        Files.createDirectories(DATOS);
    }

    protected static void borrar(Path carpeta) throws IOException {
        if (!Files.exists(carpeta)) return;
        try (Stream<Path> arbol = Files.walk(carpeta)) {
            for (Path p : arbol.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        }
    }

    // ------------------------------------------------------------------ tokens

    public static String token(long usuario) {
        return JWT.create().withSubject("u" + usuario + "@biblioteca.ah")
                .withClaim("userId", usuario)
                .withArrayClaim("roles", new String[]{"USER"})
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256(SECRETO));
    }

    protected static String bearer(long usuario) {
        return "Bearer " + token(usuario);
    }

    // ------------------------------------------------------------------ peticiones

    protected JsonNode pedir(long usuario, String ruta, Object cuerpo) throws Exception {
        var req = post("/biblioteca" + ruta).contextPath("/biblioteca")
                .header("Authorization", bearer(usuario))
                .contentType(MediaType.APPLICATION_JSON);
        if (cuerpo != null) {
            req.content(cuerpo instanceof String s ? s : json.writeValueAsString(cuerpo));
        }
        MvcResult r = mvc.perform(req).andReturn();
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected JsonNode pedir(long usuario, String ruta) throws Exception {
        return pedir(usuario, ruta, null);
    }

    protected JsonNode subir(long usuario, String nombre, byte[] contenido) throws Exception {
        return subir(usuario, "LIBRO", new MockMultipartFile("archivos", nombre, "application/octet-stream", contenido));
    }

    protected JsonNode subir(long usuario, String tipo, MockMultipartFile... ficheros) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/biblioteca/v1/libros/subir");
        for (MockMultipartFile f : ficheros) req.file(f);
        req.contextPath("/biblioteca").param("tipo", tipo).header("Authorization", bearer(usuario));
        MvcResult r = mvc.perform(req).andReturn();
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /** Sube un EPUB y devuelve el ejemplar creado. */
    protected JsonNode subirLibro(long usuario, String nombre) throws Exception {
        return subir(usuario, nombre, epub(nombre)).get("object").get(0);
    }

    // ------------------------------------------------------------------ ficheros de prueba

    /** Un EPUB minimo (ZIP de verdad); el nombre cambia el contenido y por tanto el sha256. */
    public static byte[] epub(String semilla) {
        try (ByteArrayOutputStream b = new ByteArrayOutputStream(); ZipOutputStream z = new ZipOutputStream(b)) {
            z.putNextEntry(entrada("mimetype"));
            z.write("application/epub+zip".getBytes(StandardCharsets.US_ASCII));
            z.closeEntry();
            z.putNextEntry(entrada("semilla.txt"));
            z.write(semilla.getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
            z.finish();
            return b.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Fecha fija: si no, el ZIP cambia cada segundo y el sha256 tambien. */
    private static ZipEntry entrada(String nombre) {
        ZipEntry e = new ZipEntry(nombre);
        e.setTime(946684800000L);
        return e;
    }

    public static byte[] pdf(String semilla) {
        return ("%PDF-1.7\n% " + semilla + "\n%%EOF").getBytes(StandardCharsets.ISO_8859_1);
    }

    protected static UUID uuid(JsonNode n) {
        return UUID.fromString(n.asText());
    }

    /** Deja el archivo como lo dejaria el taller tras convertirlo. */
    protected void marcarListo(UUID archivoId, int capitulos, String metadatosJson) {
        jdbc.update("UPDATE bah_lib_archivo SET estado_conversion = 'LISTO', n_capitulos = ?, "
                + "minutos_estimados = 90, tiene_portada = TRUE, metadatos = CAST(? AS jsonb) WHERE id = ?",
                capitulos, metadatosJson, archivoId);
    }

    protected Path escribir(Path ruta, byte[] contenido) throws IOException {
        Files.createDirectories(ruta.getParent());
        return Files.write(ruta, contenido);
    }
}
