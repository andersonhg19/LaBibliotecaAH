package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AsignarRolesDTO;
import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultAdminUserDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.impl.AdminUserServiceImpl;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * La administracion de cuentas, y sobre todo las dos cosas que NO puede hacer
 * ni queriendo: dejar la plataforma sin administradores y cerrarse la puerta a
 * si misma.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Administracion de usuarios")
class AdminUserServiceImplTest {

    @Mock private UserRepository userRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private org.springframework.context.ApplicationEventPublisher eventos;
    /* Sin stub devuelve Optional.empty(): "el alias sirve". Las reglas del
       alias se prueban en ElAliasEnAltasYEdicionesTest con la validacion real. */
    @Mock private com.bibliotecaah.auth.util.ValidacionDeAlias validacionDeAlias;
    @Mock private com.bibliotecaah.auth.util.Mensajes mensajes;

    @InjectMocks private AdminUserServiceImpl servicio;

    private Role rolAdmin;
    private Role rolUser;

    @BeforeEach
    void prepararRoles() {
        rolAdmin = Role.builder().id(1L).name("ADMIN").active(true).build();
        rolUser = Role.builder().id(2L).name("USER").active(true).build();
    }

    @AfterEach
    void limpiarContexto() {
        SecurityContextHolder.clearContext();
    }

    private static User usuario(Long id, String correo, boolean activo, Role... roles) {
        return User.builder()
                .id(id).name("N" + id).email(correo).password("x")
                .active(activo)
                .roles(new HashSet<>(Arrays.asList(roles)))
                .build();
    }

    private void seAutenticaComo(Long userId) {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("quien@sea", null, List.of());
        auth.setDetails(userId);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @SuppressWarnings("unchecked")
    private static ResultAdminUserDTO datos(ResultDTO resultado) {
        return (ResultAdminUserDTO) resultado.getObject();
    }

    // ========================================================================

    @Nested
    @DisplayName("Listado")
    class Listado {

        @Test
        @DisplayName("los roles de la pagina se piden en UNA consulta, no una por usuario")
        void sinConsultaPorUsuario() {
            User ana = usuario(1L, "ana@x.com", true, rolUser);
            User admin = usuario(2L, "admin@x.com", true, rolAdmin, rolUser);
            Page<User> pagina = new PageImpl<>(List.of(ana, admin), Pageable.ofSize(10), 2);
            when(userRepository.findAllForAdmin(isNull(), isNull(), isNull(), any())).thenReturn(pagina);
            when(userRepository.findAllByIdWithRoles(List.of(1L, 2L))).thenReturn(List.of(ana, admin));

            ResultDTO resultado = servicio.getAll(new UserFilterDTO());

            assertThat(resultado.isCorrect()).isTrue();
            verify(userRepository, times(1)).findAllByIdWithRoles(anyList());
            Map<String, Object> cuerpo = (Map<String, Object>) resultado.getObject();
            List<ResultAdminUserDTO> lista = (List<ResultAdminUserDTO>) cuerpo.get("list");
            assertThat(lista).hasSize(2);
            assertThat(lista.get(1).getRoles()).containsExactly("ADMIN", "USER");
        }

        @Test
        @DisplayName("una pagina vacia no dispara la consulta de roles")
        void paginaVacia() {
            when(userRepository.findAllForAdmin(any(), any(), any(), any()))
                    .thenReturn(new PageImpl<>(List.of(), Pageable.ofSize(10), 0));

            ResultDTO resultado = servicio.getAll(new UserFilterDTO());

            assertThat(resultado.isCorrect()).isTrue();
            verify(userRepository, never()).findAllByIdWithRoles(anyList());
        }

        @Test
        @DisplayName("los filtros en blanco viajan como nulos, no como cadena vacia")
        void filtrosEnBlanco() {
            UserFilterDTO filtro = new UserFilterDTO();
            filtro.setName("   ");
            filtro.setEmail("");
            when(userRepository.findAllForAdmin(isNull(), isNull(), isNull(), any()))
                    .thenReturn(new PageImpl<>(List.of(), Pageable.ofSize(10), 0));

            servicio.getAll(filtro);

            verify(userRepository).findAllForAdmin(isNull(), isNull(), isNull(), any());
        }
    }

    @Nested
    @DisplayName("Ficha")
    class Ficha {

        @Test
        @DisplayName("devuelve la cuenta con sus roles")
        void encontrada() {
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "ana@x.com", true, rolUser)));

            ResultDTO resultado = servicio.getById(1L);

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getRoles()).containsExactly("USER");
        }

        @Test
        @DisplayName("si no existe, no encontrada")
        void noExiste() {
            when(userRepository.findByIdWithRoles(9L)).thenReturn(Optional.empty());
            assertThat(servicio.getById(9L).isCorrect()).isFalse();
        }
    }

    @Nested
    @DisplayName("Alta desde administracion")
    class Alta {

        private UserSaveDTO alta(String correo, String clave) {
            UserSaveDTO dto = new UserSaveDTO();
            dto.setName("Nuevo");
            dto.setEmail(correo);
            dto.setPassword(clave);
            return dto;
        }

        @Test
        @DisplayName("toda cuenta nueva nace con USER")
        void naceConUser() {
            when(userRepository.existeCorreo("n@x.com")).thenReturn(false);
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.of(rolUser));
            when(passwordEncoder.encode("Clave12345x")).thenReturn("cifrada");
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User u = i.getArgument(0);
                u.setId(5L);
                return u;
            });

            ResultDTO resultado = servicio.crear(alta("n@x.com", "Clave12345x"));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getRoles()).containsExactly("USER");
        }

        @Test
        @DisplayName("sin contrasena no se crea")
        void sinClave() {
            assertThat(servicio.crear(alta("n@x.com", "  ")).isCorrect()).isFalse();
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("con un correo ya en uso, tampoco")
        void correoRepetido() {
            when(userRepository.existeCorreo("n@x.com")).thenReturn(true);
            assertThat(servicio.crear(alta("n@x.com", "Clave12345x")).isCorrect()).isFalse();
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("si el rol USER no estuviera, la cuenta se crea igualmente sin rol")
        void sinRolBase() {
            when(userRepository.existeCorreo("n@x.com")).thenReturn(false);
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.empty());
            when(passwordEncoder.encode(anyString())).thenReturn("cifrada");
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

            ResultDTO resultado = servicio.crear(alta("n@x.com", "Clave12345x"));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getRoles()).isEmpty();
        }
    }

    @Nested
    @DisplayName("Asignacion de roles")
    class Asignacion {

        private AsignarRolesDTO con(String... roles) {
            return new AsignarRolesDTO(new ArrayList<>(Arrays.asList(roles)));
        }

        @Test
        @DisplayName("fija la lista completa: lo que no viene, se quita")
        void fijaLaListaCompleta() {
            User ana = usuario(1L, "ana@x.com", true, rolUser, rolAdmin);
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.of(rolUser));
            when(userRepository.contarActivosConRol("ADMIN")).thenReturn(3L);

            ResultDTO resultado = servicio.asignarRoles(1L, con("USER"));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getRoles()).containsExactly("USER");
        }

        @Test
        @DisplayName("una lista vacia deja al usuario sin roles, y es legitimo")
        void listaVacia() {
            User ana = usuario(1L, "ana@x.com", true, rolUser);
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(ana));

            ResultDTO resultado = servicio.asignarRoles(1L, con());

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getRoles()).isEmpty();
        }

        @Test
        @DisplayName("un rol que no existe corta la operacion entera")
        void rolInventado() {
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "ana@x.com", true, rolUser)));
            when(roleRepository.findByNameAndActiveTrue("INVENTADO")).thenReturn(Optional.empty());

            assertThat(servicio.asignarRoles(1L, con("INVENTADO")).isCorrect()).isFalse();
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("el usuario tiene que existir")
        void usuarioInexistente() {
            when(userRepository.findByIdWithRoles(9L)).thenReturn(Optional.empty());
            assertThat(servicio.asignarRoles(9L, con("USER")).isCorrect()).isFalse();
        }

        @Test
        @DisplayName("AL ULTIMO ADMINISTRADOR NO SE LE QUITA EL ROL")
        void ultimoAdmin() {
            /* Sin esta regla, la plataforma se queda sin ningun administrador
               con dos clics y ya no hay forma de crear otro desde la app: hay
               que entrar a la base de datos a mano. */
            User admin = usuario(1L, "admin@x.com", true, rolAdmin, rolUser);
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(admin));
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.of(rolUser));
            when(userRepository.contarActivosConRol("ADMIN")).thenReturn(1L);

            ResultDTO resultado = servicio.asignarRoles(1L, con("USER"));

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(105);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("pero si quedan dos administradores, a uno si se le puede quitar")
        void penultimoAdmin() {
            User admin = usuario(1L, "admin@x.com", true, rolAdmin, rolUser);
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(admin));
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.of(rolUser));
            when(userRepository.contarActivosConRol("ADMIN")).thenReturn(2L);

            assertThat(servicio.asignarRoles(1L, con("USER")).isCorrect()).isTrue();
        }
    }

    @Nested
    @DisplayName("Activacion y desactivacion")
    class Activacion {

        @Test
        @DisplayName("desactiva una cuenta corriente")
        void desactivar() {
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "ana@x.com", true, rolUser)));

            ResultDTO resultado = servicio.cambiarActivacion(1L, false);

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getActive()).isFalse();
        }

        @Test
        @DisplayName("y reactiva la que estaba desactivada")
        void activar() {
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "ana@x.com", false, rolUser)));

            ResultDTO resultado = servicio.cambiarActivacion(1L, true);

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(datos(resultado).getActive()).isTrue();
        }

        @Test
        @DisplayName("NADIE SE DESACTIVA A SI MISMO")
        void aSiMismoNo() {
            seAutenticaComo(1L);
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "yo@x.com", true, rolAdmin)));

            ResultDTO resultado = servicio.cambiarActivacion(1L, false);

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(106);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("ni se desactiva al ultimo administrador que queda")
        void ultimoAdminNoSeDesactiva() {
            seAutenticaComo(99L);
            User admin = usuario(1L, "admin@x.com", true, rolAdmin);
            when(userRepository.findByIdWithRoles(1L)).thenReturn(Optional.of(admin));
            when(userRepository.contarActivosConRol("ADMIN")).thenReturn(1L);

            ResultDTO resultado = servicio.cambiarActivacion(1L, false);

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(105);
        }

        @Test
        @DisplayName("reactivar al ultimo administrador si se puede: no quita nada")
        void reactivarAdminSiSePuede() {
            when(userRepository.findByIdWithRoles(1L))
                    .thenReturn(Optional.of(usuario(1L, "admin@x.com", false, rolAdmin)));

            assertThat(servicio.cambiarActivacion(1L, true).isCorrect()).isTrue();
        }

        @Test
        @DisplayName("la cuenta tiene que existir")
        void inexistente() {
            when(userRepository.findByIdWithRoles(9L)).thenReturn(Optional.empty());
            assertThat(servicio.cambiarActivacion(9L, false).isCorrect()).isFalse();
        }
    }
}
