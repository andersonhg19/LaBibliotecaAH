package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultAdminUserDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.mapper.UserMapper;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.impl.AdminUserServiceImpl;
import com.bibliotecaah.auth.service.impl.UserServiceImpl;
import com.bibliotecaah.auth.util.Mensajes;
import com.bibliotecaah.auth.util.MensajesDePrueba;
import com.bibliotecaah.auth.util.ValidacionDeAlias;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * El alias en las tres puertas que lo escriben: el registro publico, el
 * guardado de la propia cuenta y el guardado de administracion. Con la
 * validacion y los mensajes REALES; solo la base es de mentira.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("El alias en altas y ediciones")
class ElAliasEnAltasYEdicionesTest {

    private static final String INVALIDO = "El usuario debe tener de 3 a 30 caracteres: letras sin tilde, números, "
            + "punto (.), guion (-) o guion bajo (_). Sin espacios ni @.";
    private static final String OCUPADO = "Ese nombre de usuario ya está en uso. Prueba con otro.";

    @Mock private UserRepository usuarios;
    @Mock private RoleRepository roles;
    @Mock private PasswordEncoder cifrador;
    @Mock private UserMapper mapper;
    @Mock private ApplicationEventPublisher eventos;

    private UserServiceImpl autoservicio;
    private AdminUserServiceImpl administracion;

    @BeforeEach
    void preparar() {
        Mensajes mensajes = MensajesDePrueba.reales();
        ValidacionDeAlias validacion = new ValidacionDeAlias(usuarios, mensajes);
        autoservicio = new UserServiceImpl(usuarios, roles, cifrador, mapper, validacion, null, mensajes);
        administracion = new AdminUserServiceImpl(usuarios, roles, cifrador, eventos, validacion, mensajes);
        lenient().when(cifrador.encode(anyString())).thenReturn("cifrada");
        lenient().when(usuarios.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(mapper.toResultDTO(any(User.class))).thenAnswer(i -> {
            User u = i.getArgument(0);
            ResultUserDTO dto = new ResultUserDTO();
            dto.setId(u.getId());
            dto.setEmail(u.getEmail());
            dto.setAlias(u.getAlias());
            return dto;
        });
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    private void soy(Long id) {
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("yo", null, List.of());
        auth.setDetails(id);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private static UserRegisterDTO registro(String alias) {
        UserRegisterDTO dto = new UserRegisterDTO();
        dto.setName("Nueva");
        dto.setEmail("nueva@biblioteca.ah");
        dto.setAlias(alias);
        dto.setPassword("Clave12345x");
        return dto;
    }

    private static UserSaveDTO guardado(Long id, String alias) {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setId(id);
        dto.setName("Nombre");
        dto.setEmail("cuenta" + id + "@biblioteca.ah");
        dto.setAlias(alias);
        return dto;
    }

    private static User cuenta(Long id, String alias) {
        return User.builder().id(id).name("Antes").email("antes" + id + "@biblioteca.ah").alias(alias)
                .password("cifrada").active(true).roles(new HashSet<>()).build();
    }

    @Nested
    @DisplayName("registro publico")
    class Registro {

        @Test
        @DisplayName("guarda el alias recortado y en minusculas, y lo devuelve")
        void normaliza() {
            ResultDTO resultado = autoservicio.register(registro("  Nueva.Lectora "));

            assertThat(resultado.isCorrect()).isTrue();
            ArgumentCaptor<User> guardada = ArgumentCaptor.forClass(User.class);
            verify(usuarios).save(guardada.capture());
            assertThat(guardada.getValue().getAlias()).isEqualTo("nueva.lectora");
            assertThat(((ResultUserDTO) resultado.getObject()).getAlias()).isEqualTo("nueva.lectora");
        }

        @Test
        @DisplayName("alias duplicado (otra mayuscula): errorCode 112 y no se guarda")
        void duplicado() {
            when(usuarios.existsByAlias("samy")).thenReturn(true);

            ResultDTO resultado = autoservicio.register(registro("SAMY"));

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(112);
            assertThat(resultado.getMessage()).isEqualTo(OCUPADO);
            verify(usuarios, never()).save(any());
        }

        @Test
        @DisplayName("alias con @: invalido y no se guarda")
        void conArroba() {
            ResultDTO resultado = autoservicio.register(registro("nueva@biblioteca.ah"));

            assertThat(resultado.getErrorCode()).isEqualTo(400);
            assertThat(resultado.getMessage()).isEqualTo(INVALIDO);
            verify(usuarios, never()).save(any());
        }

        @Test
        @DisplayName("alias con espacio o tilde: invalido")
        void formatoMalo() {
            assertThat(autoservicio.register(registro("la lectora")).getMessage()).isEqualTo(INVALIDO);
            assertThat(autoservicio.register(registro("lectoría")).getMessage()).isEqualTo(INVALIDO);
            verify(usuarios, never()).save(any());
        }
    }

    @Nested
    @DisplayName("guardado de la propia cuenta")
    class Propio {

        @Test
        @DisplayName("si no llega alias, se conserva el que tenia")
        void seConserva() {
            soy(3L);
            when(usuarios.findByIdAndActiveTrue(3L)).thenReturn(Optional.of(cuenta(3L, "lectora")));

            ResultDTO resultado = autoservicio.saveAndUpdate(guardado(3L, null));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(((ResultUserDTO) resultado.getObject()).getAlias()).isEqualTo("lectora");
            verify(usuarios, never()).existsByAliasAndIdNot(anyString(), any());
        }

        @Test
        @DisplayName("si llega, se valida sin contarse a si misma y se guarda normalizado")
        void seCambia() {
            soy(3L);
            when(usuarios.findByIdAndActiveTrue(3L)).thenReturn(Optional.of(cuenta(3L, "lectora")));
            when(usuarios.existsByAliasAndIdNot("lectora.ah", 3L)).thenReturn(false);

            ResultDTO resultado = autoservicio.saveAndUpdate(guardado(3L, " Lectora.AH "));

            assertThat(((ResultUserDTO) resultado.getObject()).getAlias()).isEqualTo("lectora.ah");
        }

        @Test
        @DisplayName("el alias de otra cuenta: 112 y nada cambia")
        void ajeno() {
            soy(3L);
            when(usuarios.findByIdAndActiveTrue(3L)).thenReturn(Optional.of(cuenta(3L, "lectora")));
            when(usuarios.existsByAliasAndIdNot("samy", 3L)).thenReturn(true);

            ResultDTO resultado = autoservicio.saveAndUpdate(guardado(3L, "samy"));

            assertThat(resultado.getErrorCode()).isEqualTo(112);
            verify(usuarios, never()).save(any());
        }

        @Test
        @DisplayName("un alias en blanco enviado a proposito no borra el actual: es obligatorio")
        void enBlanco() {
            soy(3L);
            when(usuarios.findByIdAndActiveTrue(3L)).thenReturn(Optional.of(cuenta(3L, "lectora")));

            ResultDTO resultado = autoservicio.saveAndUpdate(guardado(3L, "  "));

            assertThat(resultado.getErrorCode()).isEqualTo(400);
            assertThat(resultado.getMessage()).isEqualTo("Elige un nombre de usuario.");
            verify(usuarios, never()).save(any());
        }
    }

    @Nested
    @DisplayName("administracion")
    class Administracion {

        @Test
        @DisplayName("alta: el alias es obligatorio")
        void altaSinAlias() {
            UserSaveDTO alta = guardado(null, null);
            alta.setPassword("Clave12345x");

            ResultDTO resultado = administracion.crear(alta);

            assertThat(resultado.getErrorCode()).isEqualTo(400);
            assertThat(resultado.getMessage()).isEqualTo("Elige un nombre de usuario.");
            verify(usuarios, never()).save(any());
        }

        @Test
        @DisplayName("alta: con alias valido nace con el, normalizado")
        void altaConAlias() {
            UserSaveDTO alta = guardado(null, " Lector2 ");
            alta.setPassword("Clave12345x");

            ResultDTO resultado = administracion.crear(alta);

            assertThat(((ResultAdminUserDTO) resultado.getObject()).getAlias()).isEqualTo("lector2");
        }

        @Test
        @DisplayName("edicion sin alias: lo conserva y anota USER_UPDATE con el antes y el despues")
        void edicionConserva() {
            when(usuarios.findByIdWithRoles(4L)).thenReturn(Optional.of(cuenta(4L, "lector")));

            ResultDTO resultado = administracion.actualizar(guardado(4L, null));

            ResultAdminUserDTO dto = (ResultAdminUserDTO) resultado.getObject();
            assertThat(dto.getAlias()).isEqualTo("lector");
            assertThat(dto.getName()).isEqualTo("Nombre");
            assertThat(dto.getEmail()).isEqualTo("cuenta4@biblioteca.ah");
            ArgumentCaptor<CambioAuditable> anotado = ArgumentCaptor.forClass(CambioAuditable.class);
            verify(eventos).publishEvent(anotado.capture());
            assertThat(anotado.getValue().action()).isEqualTo(AuditLog.Accion.USER_UPDATE);
            assertThat(anotado.getValue().details())
                    .isEqualTo("Antes <antes4@biblioteca.ah> @lector -> Nombre <cuenta4@biblioteca.ah> @lector");
        }

        @Test
        @DisplayName("edicion con alias nuevo: se valida y se guarda")
        void edicionCambia() {
            when(usuarios.findByIdWithRoles(4L)).thenReturn(Optional.of(cuenta(4L, "lector")));

            ResultDTO resultado = administracion.actualizar(guardado(4L, "LECTOR.NUEVO"));

            assertThat(((ResultAdminUserDTO) resultado.getObject()).getAlias()).isEqualTo("lector.nuevo");
        }

        @Test
        @DisplayName("edicion con alias ajeno: 112")
        void edicionAjeno() {
            when(usuarios.findByIdWithRoles(4L)).thenReturn(Optional.of(cuenta(4L, "lector")));
            when(usuarios.existsByAliasAndIdNot("samy", 4L)).thenReturn(true);

            assertThat(administracion.actualizar(guardado(4L, "samy")).getErrorCode()).isEqualTo(112);
            verify(usuarios, never()).save(any());
        }

        @Test
        @DisplayName("edicion con contrasena: se rechaza, no se ignora")
        void edicionConClave() {
            UserSaveDTO dto = guardado(4L, null);
            dto.setPassword("OtraClave1");

            ResultDTO resultado = administracion.actualizar(dto);

            assertThat(resultado.getErrorCode()).isEqualTo(400);
            assertThat(resultado.getMessage()).isEqualTo(
                    "La contraseña de otra cuenta no se cambia desde Administración: cada quien cambia la suya.");
            verifyNoInteractions(usuarios);
        }

        @Test
        @DisplayName("edicion de una cuenta que no existe: userNotFound (103)")
        void edicionInexistente() {
            when(usuarios.findByIdWithRoles(9L)).thenReturn(Optional.empty());

            ResultDTO resultado = administracion.actualizar(guardado(9L, null));

            assertThat(resultado.getErrorCode()).isEqualTo(103);
            assertThat(resultado.getMessage()).isEqualTo("userNotFound");
        }

        @Test
        @DisplayName("edicion con el correo de otra cuenta: emailAlreadyInUse (102)")
        void edicionCorreoAjeno() {
            when(usuarios.findByIdWithRoles(4L)).thenReturn(Optional.of(cuenta(4L, "lector")));
            when(usuarios.existeCorreoEnOtraCuenta("cuenta4@biblioteca.ah", 4L)).thenReturn(true);

            ResultDTO resultado = administracion.actualizar(guardado(4L, null));

            assertThat(resultado.getErrorCode()).isEqualTo(102);
            verify(usuarios, never()).save(any());
        }
    }
}
