package com.bibliotecaah.biblioteca.integracion;

import com.bibliotecaah.biblioteca.PostgresDeVerdad;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

@DisplayName("Carpetas del archivador de documentos (contratos v1.6)")
class CarpetasTest extends PostgresDeVerdad {

    // ------------------------------------------------------------------ ayudas

    private String carpeta(long usuario, String nombre, String padre) throws Exception {
        Map<String, Object> cuerpo = new HashMap<>();
        cuerpo.put("nombre", nombre);
        if (padre != null) cuerpo.put("padreId", padre);
        JsonNode r = pedir(usuario, "/v1/carpetas/save", cuerpo);
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        return r.get("object").get("id").asText();
    }

    private JsonNode subirDocumento(long usuario, String carpetaId, String tipo, String nombre, byte[] bytes)
            throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/biblioteca/v1/libros/subir");
        req.file(new MockMultipartFile("archivos", nombre, "application/octet-stream", bytes));
        req.contextPath("/biblioteca").param("tipo", tipo).header("Authorization", bearer(usuario));
        if (carpetaId != null) req.param("carpetaId", carpetaId);
        MvcResult r = mvc.perform(req).andReturn();
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String documento(long usuario, String carpetaId, String nombre) throws Exception {
        JsonNode r = subirDocumento(usuario, carpetaId, "DOCUMENTO", nombre, texto(nombre));
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        return r.get("object").get(0).get("id").asText();
    }

    private static byte[] texto(String semilla) {
        return ("# " + semilla + "\n\nContenido de " + semilla).getBytes(StandardCharsets.UTF_8);
    }

    private JsonNode contenido(long usuario, String carpetaId, String texto, String orden) throws Exception {
        Map<String, Object> cuerpo = new HashMap<>();
        if (carpetaId != null) cuerpo.put("carpetaId", carpetaId);
        if (texto != null) cuerpo.put("texto", texto);
        if (orden != null) cuerpo.put("orden", orden);
        JsonNode r = pedir(usuario, "/v1/carpetas/contenido", cuerpo);
        assertThat(r.get("correct").asBoolean()).as(r.toString()).isTrue();
        return r.get("object");
    }

    private static List<String> campo(JsonNode lista, String nombre) {
        List<String> valores = new ArrayList<>();
        lista.forEach(n -> valores.add(n.get(nombre).asText()));
        return valores;
    }

    // ------------------------------------------------------------------ pruebas

    @Nested
    @DisplayName("Crear, renombrar y listar")
    class Crear {

        @Test
        @DisplayName("subcarpetas, migas de pan y cuentas recursivas de documentos")
        void arbolYCuentas() throws Exception {
            String proyectos = carpeta(ANDERSON, "Proyectos", null);
            String y2026 = carpeta(ANDERSON, "2026", proyectos);
            String enero = carpeta(ANDERSON, "Enero", y2026);
            documento(ANDERSON, proyectos, "plan.md");
            documento(ANDERSON, enero, "acta.md");
            documento(ANDERSON, null, "suelto.md");

            JsonNode raiz = contenido(ANDERSON, null, null, null);
            assertThat(raiz.get("carpeta").isNull()).isTrue();
            assertThat(raiz.get("ruta")).isEmpty();
            assertThat(campo(raiz.get("subcarpetas"), "nombre")).containsExactly("Proyectos");
            assertThat(raiz.get("subcarpetas").get(0).get("nDocumentos").asInt()).isEqualTo(2);
            assertThat(raiz.get("subcarpetas").get(0).get("nSubcarpetas").asInt()).isEqualTo(1);
            assertThat(campo(raiz.get("documentos"), "titulo")).containsExactly("suelto");
            assertThat(raiz.get("totalDocumentos").asInt()).isEqualTo(3);
            assertThat(raiz.get("busqueda").asBoolean()).isFalse();
            assertThat(raiz.get("recortado").asBoolean()).isFalse();

            JsonNode dentro = contenido(ANDERSON, enero, null, null);
            assertThat(dentro.get("carpeta").get("nombre").asText()).isEqualTo("Enero");
            assertThat(campo(dentro.get("ruta"), "nombre")).containsExactly("Proyectos", "2026", "Enero");
            assertThat(campo(dentro.get("documentos"), "titulo")).containsExactly("acta");
            assertThat(dentro.get("documentos").get(0).get("carpetaId").asText()).isEqualTo(enero);
            assertThat(dentro.get("documentos").get(0).get("formatoOriginal").asText()).isEqualTo("MD");

            JsonNode todas = pedir(ANDERSON, "/v1/carpetas/all").get("object");
            assertThat(campo(todas, "nombre")).containsExactly("Proyectos", "2026", "Enero");
            assertThat(todas.get(1).get("padreId").asText()).isEqualTo(proyectos);
        }

        @Test
        @DisplayName("nombre repetido entre hermanas (sin mayusculas) da 101; en otra carpeta si se puede")
        void duplicado() throws Exception {
            String a = carpeta(ANDERSON, "Recibos", null);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", "  RECIBOS "));
            assertThat(r.get("errorCode").asInt()).isEqualTo(101);
            assertThat(r.get("message").asText()).isEqualTo("Ya tienes una carpeta llamada \"RECIBOS\" en ese lugar.");
            carpeta(ANDERSON, "Recibos", a);
            carpeta(SAMY, "Recibos", null);
            String b = carpeta(ANDERSON, "Facturas", null);
            assertThat(pedir(ANDERSON, "/v1/carpetas/save", Map.of("id", b, "nombre", "recibos")).get("errorCode").asInt())
                    .isEqualTo(101);
            JsonNode renombrada = pedir(ANDERSON, "/v1/carpetas/save", Map.of("id", b, "nombre", "Facturas\t  2026"));
            assertThat(renombrada.get("object").get("nombre").asText()).isEqualTo("Facturas 2026");
            assertThat(pedir(ANDERSON, "/v1/carpetas/save", Map.of("id", a, "nombre", "recibos")).get("correct").asBoolean())
                    .isTrue();
        }

        @Test
        @DisplayName("nombre vacio o largo da 120; mas de 10 niveles da 120; padre ajeno da 102")
        void validaciones() throws Exception {
            assertThat(pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", " ")).get("errorCode").asInt()).isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", "x".repeat(101))).get("errorCode").asInt())
                    .isEqualTo(120);
            String padre = null;
            for (int i = 1; i <= 10; i++) padre = carpeta(ANDERSON, "Nivel " + i, padre);
            JsonNode once = pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", "Nivel 11", "padreId", padre));
            assertThat(once.get("errorCode").asInt()).isEqualTo(120);
            assertThat(once.get("message").asText()).isEqualTo("Las carpetas se pueden anidar hasta 10 niveles.");
            String ajena = carpeta(SAMY, "De Samy", null);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", "Intrusa", "padreId", ajena));
            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(r.get("message").asText()).isEqualTo("La carpeta no existe o no es tuya.");
            assertThat(pedir(ANDERSON, "/v1/carpetas/save", Map.of("id", ajena, "nombre", "Mia")).get("errorCode").asInt())
                    .isEqualTo(102);
        }

        @Test
        @DisplayName("el tope de carpetas por usuario da 120")
        void tope() throws Exception {
            int antes = topes.getCarpetasPorUsuario();
            topes.setCarpetasPorUsuario(2);
            try {
                carpeta(ANDERSON, "Una", null);
                carpeta(ANDERSON, "Dos", null);
                JsonNode r = pedir(ANDERSON, "/v1/carpetas/save", Map.of("nombre", "Tres"));
                assertThat(r.get("errorCode").asInt()).isEqualTo(120);
                assertThat(r.get("message").asText()).isEqualTo("Ya tienes 2 carpetas, el máximo. Borra alguna antes de crear otra.");
            } finally {
                topes.setCarpetasPorUsuario(antes);
            }
        }

        @Test
        @DisplayName("abrir una carpeta ajena o inexistente da 102")
        void ajena() throws Exception {
            String ajena = carpeta(SAMY, "Privada", null);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/contenido", Map.of("carpetaId", ajena));
            assertThat(r.get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/carpetas/contenido", Map.of("carpetaId", UUID.randomUUID().toString()))
                    .get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/carpetas/all").get("object")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Subir, mover y ordenar")
    class Mover {

        @Test
        @DisplayName("subir directamente a una carpeta; como LIBRO o a una carpeta ajena se rechaza antes de copiar")
        void subirACarpeta() throws Exception {
            String c = carpeta(ANDERSON, "Contratos", null);
            JsonNode r = subirDocumento(ANDERSON, c, "DOCUMENTO", "arriendo.md", texto("arriendo"));
            assertThat(r.get("object").get(0).get("carpetaId").asText()).isEqualTo(c);
            assertThat(contenido(ANDERSON, c, null, null).get("documentos")).hasSize(1);

            JsonNode libro = subirDocumento(ANDERSON, c, "LIBRO", "novela.md", texto("novela"));
            assertThat(libro.get("errorCode").asInt()).isEqualTo(120);
            assertThat(libro.get("message").asText())
                    .isEqualTo("Las carpetas son para documentos personales: sube los archivos como documentos.");
            String ajena = carpeta(SAMY, "Ajena", null);
            assertThat(subirDocumento(ANDERSON, ajena, "DOCUMENTO", "x.md", texto("x")).get("errorCode").asInt())
                    .isEqualTo(102);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_archivo", Integer.class)).isEqualTo(1);

            /* Lo que ya tenias no se mueve al subirlo otra vez a otra carpeta. */
            String otra = carpeta(ANDERSON, "Otra", null);
            JsonNode repetido = subirDocumento(ANDERSON, otra, "DOCUMENTO", "arriendo.md", texto("arriendo"));
            assertThat(repetido.get("object").get(0).get("yaLoTenias").asBoolean()).isTrue();
            assertThat(repetido.get("object").get(0).get("carpetaId").asText()).isEqualTo(c);
        }

        @Test
        @DisplayName("mover varios documentos a la vez, a una carpeta y de vuelta a la raiz")
        void moverDocumentos() throws Exception {
            String a = documento(ANDERSON, null, "a.md");
            String b = documento(ANDERSON, null, "b.md");
            String c = carpeta(ANDERSON, "Destino", null);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/mover-documentos", Map.of("ejemplarIds", List.of(a, b, a), "carpetaId", c));
            assertThat(r.get("object").asInt()).isEqualTo(2);
            assertThat(campo(contenido(ANDERSON, c, null, null).get("documentos"), "id")).containsExactlyInAnyOrder(a, b);
            assertThat(contenido(ANDERSON, null, null, null).get("subcarpetas").get(0).get("nDocumentos").asInt()).isEqualTo(2);

            Map<String, Object> aLaRaiz = new HashMap<>();
            aLaRaiz.put("ejemplarIds", List.of(b));
            aLaRaiz.put("carpetaId", null);
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover-documentos", aLaRaiz).get("object").asInt()).isEqualTo(1);
            assertThat(campo(contenido(ANDERSON, null, null, null).get("documentos"), "id")).containsExactly(b);
        }

        @Test
        @DisplayName("mover un libro, un documento ajeno o a una carpeta ajena se rechaza sin mover nada")
        void moverRechazos() throws Exception {
            String doc = documento(ANDERSON, null, "mio.md");
            String libro = subirLibro(ANDERSON, "libro.epub").get("id").asText();
            String deSamy = documento(SAMY, null, "de-samy.md");
            String c = carpeta(ANDERSON, "Destino", null);
            String ajena = carpeta(SAMY, "Ajena", null);

            JsonNode conLibro = pedir(ANDERSON, "/v1/carpetas/mover-documentos", Map.of("ejemplarIds", List.of(doc, libro), "carpetaId", c));
            assertThat(conLibro.get("errorCode").asInt()).isEqualTo(120);
            assertThat(conLibro.get("message").asText()).isEqualTo("Solo los documentos personales van en carpetas (\"libro\" no es un documento).");
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover-documentos", Map.of("ejemplarIds", List.of(doc, deSamy), "carpetaId", c))
                    .get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover-documentos", Map.of("ejemplarIds", List.of(doc), "carpetaId", ajena))
                    .get("errorCode").asInt()).isEqualTo(102);
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover-documentos", Map.of("ejemplarIds", List.of())).get("errorCode").asInt())
                    .isEqualTo(120);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_ejemplar WHERE carpeta_id IS NOT NULL", Integer.class))
                    .isZero();
        }

        @Test
        @DisplayName("mover una carpeta: dentro de si misma o de su hija da 120; a la raiz y con nombre ocupado da 101")
        void moverCarpeta() throws Exception {
            String a = carpeta(ANDERSON, "A", null);
            String b = carpeta(ANDERSON, "B", a);
            String c = carpeta(ANDERSON, "C", null);
            carpeta(ANDERSON, "B", c);
            JsonNode enHija = pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", a, "destinoId", b));
            assertThat(enHija.get("errorCode").asInt()).isEqualTo(120);
            assertThat(enHija.get("message").asText())
                    .isEqualTo("Una carpeta no se puede mover dentro de sí misma ni de una de sus subcarpetas.");
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", a, "destinoId", a)).get("errorCode").asInt())
                    .isEqualTo(120);
            assertThat(pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", b, "destinoId", c)).get("errorCode").asInt())
                    .isEqualTo(101);
            JsonNode mismo = pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", b, "destinoId", a));
            assertThat(mismo.get("object").get("padreId").asText()).isEqualTo(a);

            Map<String, Object> aLaRaiz = new HashMap<>();
            aLaRaiz.put("carpetaId", b);
            aLaRaiz.put("destinoId", null);
            JsonNode raiz = pedir(ANDERSON, "/v1/carpetas/mover", aLaRaiz);
            assertThat(raiz.get("object").get("padreId").isNull()).isTrue();
            assertThat(campo(contenido(ANDERSON, null, null, null).get("subcarpetas"), "nombre")).containsExactly("A", "B", "C");
            JsonNode dentroDeC = pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", a, "destinoId", c));
            assertThat(dentroDeC.get("object").get("padreId").asText()).isEqualTo(c);
            assertThat(campo(contenido(ANDERSON, c, null, null).get("subcarpetas"), "nombre")).containsExactly("A", "B");
        }

        @Test
        @DisplayName("mover una carpeta no puede pasar de 10 niveles")
        void moverProfundo() throws Exception {
            String padre = null;
            for (int i = 1; i <= 9; i++) padre = carpeta(ANDERSON, "N" + i, padre);
            String rama = carpeta(ANDERSON, "Rama", null);
            carpeta(ANDERSON, "Hoja", rama);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/mover", Map.of("carpetaId", rama, "destinoId", padre));
            assertThat(r.get("errorCode").asInt()).isEqualTo(120);
        }

        @Test
        @DisplayName("orden por nombre (con tildes), recientes y antiguos, en carpetas y documentos")
        void orden() throws Exception {
            /* Fechas fijas: dos altas seguidas pueden caer en el mismo instante del reloj. */
            for (String[] c : new String[][]{{"beta", "3"}, {"Álbum", "2"}, {"Casa", "1"}}) {
                String id = carpeta(ANDERSON, c[0], null);
                jdbc.update("UPDATE bah_lib_carpeta SET creation = now() - CAST(? AS interval) WHERE id = ?",
                        c[1] + " hours", UUID.fromString(id));
            }
            documento(ANDERSON, null, "zeta.md");
            documento(ANDERSON, null, "alfa.md");

            JsonNode nombre = contenido(ANDERSON, null, null, "NOMBRE");
            assertThat(campo(nombre.get("subcarpetas"), "nombre")).containsExactly("Álbum", "beta", "Casa");
            assertThat(campo(nombre.get("documentos"), "titulo")).containsExactly("alfa", "zeta");
            JsonNode recientes = contenido(ANDERSON, null, null, "RECIENTES");
            assertThat(campo(recientes.get("subcarpetas"), "nombre")).containsExactly("Casa", "Álbum", "beta");
            assertThat(campo(recientes.get("documentos"), "titulo")).containsExactly("alfa", "zeta");
            JsonNode antiguos = contenido(ANDERSON, null, null, "ANTIGUOS");
            assertThat(campo(antiguos.get("subcarpetas"), "nombre")).containsExactly("beta", "Álbum", "Casa");
            assertThat(campo(antiguos.get("documentos"), "titulo")).containsExactly("zeta", "alfa");
        }

        @Test
        @DisplayName("un documento que pasa a ser libro sale de su carpeta")
        void cambiarTipo() throws Exception {
            String c = carpeta(ANDERSON, "Temporal", null);
            String d = documento(ANDERSON, c, "era-documento.md");
            JsonNode r = pedir(ANDERSON, "/v1/libros/save", Map.of("id", d, "tipo", "LIBRO"));
            assertThat(r.get("object").get("carpetaId").isNull()).isTrue();
            assertThat(contenido(ANDERSON, c, null, null).get("documentos")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Buscar dentro")
    class Buscar {

        @Test
        @DisplayName("busca sin tildes ni mayusculas en la carpeta y sus subcarpetas, con la ruta de cada resultado")
        void buscar() throws Exception {
            String obra = carpeta(ANDERSON, "Obra casa", null);
            String planos = carpeta(ANDERSON, "Planos", obra);
            String fuera = carpeta(ANDERSON, "Otra cosa", null);
            documento(ANDERSON, planos, "Cotización cocina.md");
            documento(ANDERSON, obra, "presupuesto.md");
            documento(ANDERSON, fuera, "cotizacion-vieja.md");
            documento(ANDERSON, null, "cotizacion-raiz.md");

            JsonNode enObra = contenido(ANDERSON, obra, "COTIZACION", null);
            assertThat(enObra.get("busqueda").asBoolean()).isTrue();
            assertThat(campo(enObra.get("documentos"), "titulo")).containsExactly("Cotización cocina");
            assertThat(enObra.get("ubicaciones").get(planos).asText()).isEqualTo("Obra casa / Planos");

            JsonNode todo = contenido(ANDERSON, null, "cotiz", null);
            assertThat(campo(todo.get("documentos"), "titulo"))
                    .containsExactlyInAnyOrder("cotizacion raiz", "cotizacion vieja", "Cotización cocina");

            JsonNode carpetas = contenido(ANDERSON, null, "PLANO", null);
            assertThat(campo(carpetas.get("subcarpetas"), "nombre")).containsExactly("Planos");
            assertThat(carpetas.get("ubicaciones").get(obra).asText()).isEqualTo("Obra casa");
            assertThat(contenido(ANDERSON, fuera, "planos", null).get("subcarpetas")).isEmpty();
            assertThat(contenido(SAMY, null, "cotiz", null).get("documentos")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Borrar")
    class Borrar {

        @Test
        @DisplayName("una carpeta vacia se borra sin elegir; con algo dentro hay que elegir (120)")
        void elegir() throws Exception {
            String vacia = carpeta(ANDERSON, "Vacia", null);
            JsonNode r = pedir(ANDERSON, "/v1/carpetas/delete/" + vacia);
            assertThat(r.get("object").get("carpetasBorradas").asInt()).isEqualTo(1);

            String llena = carpeta(ANDERSON, "Llena", null);
            carpeta(ANDERSON, "Sub", llena);
            documento(ANDERSON, llena, "uno.md");
            JsonNode sinElegir = pedir(ANDERSON, "/v1/carpetas/delete/" + llena);
            assertThat(sinElegir.get("errorCode").asInt()).isEqualTo(120);
            assertThat(sinElegir.get("message").asText()).isEqualTo("La carpeta tiene 1 documento(s) y 1 subcarpeta(s): "
                    + "elige si lo de dentro pasa a la carpeta de arriba o se borra.");
            assertThat(pedir(SAMY, "/v1/carpetas/delete/" + llena, Map.of("contenido", "BORRAR")).get("errorCode").asInt())
                    .isEqualTo(102);
        }

        @Test
        @DisplayName("SUBIR pasa documentos y subcarpetas a la carpeta de arriba, renombrando choques")
        void subir() throws Exception {
            String padre = carpeta(ANDERSON, "Padre", null);
            String hija = carpeta(ANDERSON, "Hija", padre);
            carpeta(ANDERSON, "Nieta", hija);
            carpeta(ANDERSON, "Hija", hija);
            documento(ANDERSON, hija, "doc-hija.md");

            JsonNode r = pedir(ANDERSON, "/v1/carpetas/delete/" + hija, Map.of("contenido", "SUBIR")).get("object");
            assertThat(r.get("documentosMovidos").asInt()).isEqualTo(1);
            assertThat(r.get("carpetasMovidas").asInt()).isEqualTo(2);
            assertThat(r.get("documentosRetirados").asInt()).isZero();
            JsonNode enPadre = contenido(ANDERSON, padre, null, null);
            assertThat(campo(enPadre.get("subcarpetas"), "nombre")).containsExactly("Hija (2)", "Nieta");
            assertThat(campo(enPadre.get("documentos"), "titulo")).containsExactly("doc hija");

            /* De primer nivel: lo de dentro va a la raiz. */
            JsonNode raiz = pedir(ANDERSON, "/v1/carpetas/delete/" + padre, Map.of("contenido", "SUBIR")).get("object");
            assertThat(raiz.get("carpetasMovidas").asInt()).isEqualTo(2);
            JsonNode enRaiz = contenido(ANDERSON, null, null, null);
            assertThat(campo(enRaiz.get("subcarpetas"), "nombre")).containsExactly("Hija (2)", "Nieta");
            assertThat(campo(enRaiz.get("documentos"), "titulo")).containsExactly("doc hija");
        }

        @Test
        @DisplayName("BORRAR quita el subarbol y retira los documentos; al volver a subirlos reaparecen en la raiz")
        void borrar() throws Exception {
            String c = carpeta(ANDERSON, "Viejo", null);
            String sub = carpeta(ANDERSON, "Más viejo", c);
            documento(ANDERSON, c, "a.md");
            documento(ANDERSON, sub, "b.md");
            documento(ANDERSON, null, "queda.md");

            JsonNode r = pedir(ANDERSON, "/v1/carpetas/delete/" + c, Map.of("contenido", "BORRAR")).get("object");
            assertThat(r.get("documentosRetirados").asInt()).isEqualTo(2);
            assertThat(r.get("carpetasBorradas").asInt()).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bah_lib_carpeta", Integer.class)).isZero();
            JsonNode raiz = contenido(ANDERSON, null, null, null);
            assertThat(campo(raiz.get("documentos"), "titulo")).containsExactly("queda");
            assertThat(raiz.get("totalDocumentos").asInt()).isEqualTo(1);

            JsonNode vuelve = subirDocumento(ANDERSON, null, "DOCUMENTO", "b.md", texto("b.md")).get("object").get(0);
            assertThat(vuelve.get("carpetaId").isNull()).isTrue();
            assertThat(contenido(ANDERSON, null, null, null).get("documentos")).hasSize(2);
        }
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.bibliotecaah.biblioteca.config.Topes topes;
}
