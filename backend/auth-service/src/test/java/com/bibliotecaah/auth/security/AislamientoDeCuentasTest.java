package com.bibliotecaah.auth.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * ============================================================================
 * AISLAMIENTO DE CUENTAS
 * ============================================================================
 *
 * La tercera red de seguridad, para el servicio que faltaba.
 *
 * La ola de identidad arreglo budget y despues fasting, pero se salto
 * UserController: cualquier usuario autenticado podia leer la ficha de otro,
 * EDITARLE el correo y la contrasena, DARLE DE BAJA la cuenta con solo su id,
 * y listar el directorio entero de la plataforma con nombre y correo — con un
 * LIKE, ademas, asi que buscar "a" los sacaba a todos.
 *
 * El unico uso legitimo del listado es invitar al nucleo familiar por correo,
 * y ese caso exige conocer el correo de antemano. Por eso el filtro ahora es
 * de igualdad y sin correo solo te devuelve a ti.
 */
@SpringBootTest
@DisplayName("Aislamiento de cuentas: Bruno no toca la cuenta de Ana")
class AislamientoDeCuentasTest {

    @Autowired private WebApplicationContext contexto;
    @Autowired private UserRepository usuarios;
    @Autowired private PasswordEncoder cifrador;
    @Value("${secret}") private String secreto;

    private MockMvc mvc;
    private Long idDeAna;
    private Long idDeBruno;
    private String claveOriginalDeAna;

    @BeforeEach
    void prepararEscenario() {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).apply(springSecurity()).build();
        usuarios.deleteAll();

        User ana = usuarios.save(User.builder()
                .name("Ana").email("ana@biblioteca.ah")
                .password(cifrador.encode("ClaveDeAna1")).active(true).build());
        idDeAna = ana.getId();
        claveOriginalDeAna = ana.getPassword();

        idDeBruno = usuarios.save(User.builder()
                .name("Bruno").email("bruno@biblioteca.ah")
                .password(cifrador.encode("ClaveDeBruno1")).active(true).build())
                .getId();
    }

    private String tokenDeBruno() {
        return "Bearer " + JWT.create().withSubject("bruno@biblioteca.ah")
                .withClaim("userId", idDeBruno)
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256(secreto));
    }

    private String atacar(String ruta, String cuerpo) throws Exception {
        return mvc.perform(post(ruta).header("Authorization", tokenDeBruno())
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo == null ? "{}" : cuerpo))
                .andReturn().getResponse().getContentAsString();
    }

    // ========================================================================

    @Test
    @DisplayName("no puede leer la ficha de Ana")
    void leerFicha() throws Exception {
        assertThat(atacar("/v1/users/get/" + idDeAna, null))
                .doesNotContain("ana@biblioteca.ah");
    }

    @Test
    @DisplayName("no puede cambiarle el correo ni la contrasena a Ana")
    void secuestrarCuenta() throws Exception {
        atacar("/v1/users/save",
                "{\"id\":" + idDeAna + ",\"name\":\"Ana\",\"email\":\"bruno@evil.com\","
                        + "\"password\":\"NuevaClave1\"}");

        User ana = usuarios.findById(idDeAna).orElseThrow();
        assertThat(ana.getEmail())
                .as("le cambiaron el correo a Ana: pierde el acceso a su cuenta")
                .isEqualTo("ana@biblioteca.ah");
        assertThat(ana.getPassword())
                .as("le cambiaron la contrasena a Ana")
                .isEqualTo(claveOriginalDeAna);
    }

    @Test
    @DisplayName("no puede dar de baja la cuenta de Ana")
    void borrarCuenta() throws Exception {
        atacar("/v1/users/delete/" + idDeAna, null);
        assertThat(usuarios.findById(idDeAna))
                .as("desactivaron la cuenta de Ana y se queda sin poder entrar")
                .get().extracting(User::getActive).isEqualTo(true);
    }

    @Test
    @DisplayName("el listado no es un directorio: sin correo solo se ve a si mismo")
    void listadoNoEsDirectorio() throws Exception {
        String r = atacar("/v1/users/all", "{\"page\":0,\"size\":50}");
        assertThat(r)
                .as("Bruno listo a los demas usuarios de la plataforma")
                .doesNotContain("ana@biblioteca.ah");
        assertThat(r)
                .as("y deberia seguir viendose a si mismo")
                .contains("bruno@biblioteca.ah");
    }

    @Test
    @DisplayName("no puede rastrear correos por coincidencia parcial")
    void nadaDeBusquedaParcial() throws Exception {
        /* Antes el filtro era un LIKE: con "a" salian todos. Ahora es
           igualdad, asi que hay que saber el correo entero — que es
           exactamente el permiso que da poder invitar a alguien. */
        assertThat(atacar("/v1/users/all", "{\"email\":\"ana\",\"page\":0,\"size\":50}"))
                .doesNotContain("ana@biblioteca.ah");
    }

    @Test
    @DisplayName("pero SI puede resolver un correo exacto: la invitacion al hogar depende de ello")
    void invitacionPorCorreoSigueFuncionando() throws Exception {
        assertThat(atacar("/v1/users/all", "{\"email\":\"ana@biblioteca.ah\",\"page\":0,\"size\":50}"))
                .as("sin esto, invitar a alguien al nucleo familiar deja de funcionar")
                .contains("ana@biblioteca.ah");
    }

    @Test
    @DisplayName("con su propia cuenta si puede: leerla, editarla y darse de baja")
    void conLoSuyoSiPuede() throws Exception {
        assertThat(atacar("/v1/users/get/" + idDeBruno, null)).contains("bruno@biblioteca.ah");

        atacar("/v1/users/save",
                "{\"id\":" + idDeBruno + ",\"name\":\"Bruno Nuevo\","
                        + "\"email\":\"bruno@biblioteca.ah\"}");
        assertThat(usuarios.findById(idDeBruno).orElseThrow().getName()).isEqualTo("Bruno Nuevo");

        atacar("/v1/users/delete/" + idDeBruno, null);
        assertThat(usuarios.findById(idDeBruno).orElseThrow().getActive()).isFalse();
    }

    // ========================================================================
    // ADMINISTRACION — la segunda pregunta
    //
    // Lo de arriba comprueba QUIEN eres: Bruno no llega a los datos de Ana.
    // Lo de abajo comprueba QUE PUEDES HACER: Bruno tiene un token
    // perfectamente valido y no lleva el rol ADMIN, asi que la puerta de
    // administracion no se le abre. Y no basta con que no pueda: la respuesta
    // tiene que ser un 403, no un 200 con la lista vacia, porque un 200
    // significa que la ruta se ejecuto y solo no encontro nada.
    // ========================================================================

    private int estadoAtacando(String ruta, String cuerpo) throws Exception {
        return mvc.perform(post(ruta).header("Authorization", tokenDeBruno())
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo == null ? "{}" : cuerpo))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("sin el rol ADMIN, la administracion de usuarios esta cerrada entera")
    void administracionDeUsuariosCerrada() throws Exception {
        assertThat(estadoAtacando("/v1/admin/users/all", "{\"page\":0,\"size\":50}"))
                .as("Bruno listo a todos los usuarios por la puerta de administracion")
                .isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/users/get/" + idDeAna, null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/users/save",
                "{\"name\":\"Colado\",\"email\":\"colado@biblioteca.ah\",\"password\":\"Clave123\"}"))
                .as("Bruno se creo una cuenta desde administracion")
                .isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/users/" + idDeBruno + "/roles",
                "{\"roles\":[\"ADMIN\"]}"))
                .as("Bruno se ascendio a si mismo a administrador")
                .isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/users/" + idDeAna + "/deactivate", null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/users/" + idDeAna + "/activate", null)).isEqualTo(403);
    }

    @Test
    @DisplayName("sin el rol ADMIN, tampoco se tocan los roles")
    void administracionDeRolesCerrada() throws Exception {
        assertThat(estadoAtacando("/v1/admin/roles/all", null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/roles/save",
                "{\"name\":\"SUPER\",\"description\":\"todo\"}")).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/roles/delete/1", null)).isEqualTo(403);
    }

    @Test
    @DisplayName("ni los modulos, ni los permisos de nadie")
    void administracionDeModulosCerrada() throws Exception {
        assertThat(estadoAtacando("/v1/admin/modules/all", null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/permissions/USER", null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/permissions/save",
                "{\"roleName\":\"USER\",\"pageId\":1,\"canRead\":true,\"canCreate\":true,"
                        + "\"canUpdate\":true,\"canDelete\":true}"))
                .as("Bruno se concedio permisos a si mismo")
                .isEqualTo(403);
    }

    @Test
    @DisplayName("la configuracion de la instalacion tampoco se toca sin el rol")
    void configuracionCerrada() throws Exception {
        assertThat(estadoAtacando("/v1/admin/config/all", null)).isEqualTo(403);
        assertThat(estadoAtacando("/v1/admin/config/save",
                "{\"configKey\":\"app.name\",\"value\":\"XXX\"}"))
                .as("Bruno le cambio la moneda a toda la instalacion")
                .isEqualTo(403);
    }

    @Test
    @DisplayName("pero sus PROPIAS preferencias si las puede consultar")
    void preferenciasPropiasSi() throws Exception {
        /* No recibe ningun id: no hay forma de pedir las de otro. */
        assertThat(estadoAtacando("/v1/preferences/mine", null)).isEqualTo(200);
    }

    @Test
    @DisplayName("y la auditoria no se lee sin ser administrador")
    void auditoriaCerrada() throws Exception {
        /* Es el registro de quien hizo que en toda la plataforma: correos,
           horas y cambios de permisos de todo el mundo. */
        assertThat(estadoAtacando("/v1/admin/audit/all", "{\"page\":0,\"size\":50}"))
                .isEqualTo(403);
    }

    @Test
    @DisplayName("el menu solo trae lo que ESE usuario puede ver")
    void elMenuNoEsUnCatalogo() throws Exception {
        /* No hay forma de pedir el menu de otro: el endpoint no recibe ningun
           id, los roles salen del token. Y lo que devuelve es lo concedido, no
           el catalogo entero con marcas — si fuera lo segundo, la lista de
           pantallas de administracion viajaria al telefono de cualquiera. */
        String suMenu = atacar("/v1/menu/mine", null);

        assertThat(suMenu)
                .as("el menu de un usuario corriente nombra el modulo de administracion")
                .doesNotContain("administracion");
        assertThat(suMenu)
                .as("ni sus pantallas")
                .doesNotContain("AdminUsers");
    }

    @Test
    @DisplayName("y el ascenso no se consigue escribiendolo en el token")
    void elRolNoSeFalsifica() throws Exception {
        /* El claim "roles" va DENTRO del token firmado. Bruno puede escribir
           lo que quiera en el suyo, pero al cambiarlo la firma deja de
           cuadrar y el filtro responde 401 antes de mirar el rol.
           Esta prueba es la que da valor a las dos de arriba: sin ella,
           "hace falta el rol ADMIN" solo significaria "hace falta decir que
           lo tienes". */
        String tokenFalsificado = "Bearer " + JWT.create().withSubject("bruno@biblioteca.ah")
                .withClaim("userId", idDeBruno)
                .withArrayClaim("roles", new String[]{"ADMIN"})
                .withExpiresAt(new Date(System.currentTimeMillis() + 3_600_000))
                .sign(Algorithm.HMAC256("otro-secreto-distinto-del-servidor"));

        int estado = mvc.perform(post("/v1/admin/users/all")
                        .header("Authorization", tokenFalsificado)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"page\":0,\"size\":10}"))
                .andReturn().getResponse().getStatus();

        assertThat(estado)
                .as("un token firmado con otra clave abrio la administracion")
                .isEqualTo(401);
    }
}
