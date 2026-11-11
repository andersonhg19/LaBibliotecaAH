package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.PermisoSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultModuleDTO;
import com.bibliotecaah.auth.dto.output.ResultPermisoDTO;
import com.bibliotecaah.auth.entity.Module;
import com.bibliotecaah.auth.entity.Page;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.RolePermission;
import com.bibliotecaah.auth.repository.ModuleRepository;
import com.bibliotecaah.auth.repository.PageRepository;
import com.bibliotecaah.auth.repository.RolePermissionRepository;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.service.impl.AdminModuleServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Administracion de modulos y permisos")
class AdminModuleServiceImplTest {

    @Mock private ModuleRepository modulos;
    @Mock private PageRepository paginas;
    @Mock private RoleRepository roles;
    @Mock private RolePermissionRepository permisos;
    @Mock private org.springframework.context.ApplicationEventPublisher eventos;

    @InjectMocks private AdminModuleServiceImpl servicio;

    private static Module modulo(Long id, String code, int orden) {
        return Module.builder().id(id).code(code).name(code).icon("i")
                .sortOrder(orden).active(true).build();
    }

    private static Page pagina(Long id, Module modulo, String code) {
        return Page.builder().id(id).module(modulo).code(code).name(code)
                .route("Ruta" + code).icon("i").inMenu(true).sortOrder(1).active(true).build();
    }

    private static PermisoSaveDTO permisoDTO(String rol, Long pageId,
                                             boolean leer, boolean crear,
                                             boolean actualizar, boolean borrar) {
        return new PermisoSaveDTO(rol, pageId, leer, crear, actualizar, borrar);
    }

    @SuppressWarnings("unchecked")
    private static List<ResultModuleDTO> listaModulos(ResultDTO r) {
        return (List<ResultModuleDTO>) r.getObject();
    }

    @Nested
    @DisplayName("Catalogo")
    class Catalogo {

        @Test
        @DisplayName("devuelve los modulos con sus paginas, ordenados")
        void catalogoOrdenado() {
            Module finanzas = modulo(1L, "finanzas", 1);
            Module admin = modulo(2L, "administracion", 9);
            when(modulos.findAll()).thenReturn(List.of(admin, finanzas));
            when(paginas.findAllByModuleIdOrderBySortOrderAsc(1L))
                    .thenReturn(List.of(pagina(10L, finanzas, "panel")));
            when(paginas.findAllByModuleIdOrderBySortOrderAsc(2L)).thenReturn(List.of());

            List<ResultModuleDTO> resultado = listaModulos(servicio.getModulos());

            assertThat(resultado).extracting(ResultModuleDTO::getCode)
                    .containsExactly("finanzas", "administracion");
            assertThat(resultado.get(0).getPages()).hasSize(1);
            assertThat(resultado.get(0).getPages().get(0).getRoute()).isEqualTo("Rutapanel");
        }
    }

    @Nested
    @DisplayName("Permisos de un rol")
    class PermisosDeRol {

        @Test
        @DisplayName("los lista con su modulo y pagina")
        void losLista() {
            Module finanzas = modulo(1L, "finanzas", 1);
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(permisos.findTodosDelRol("USER")).thenReturn(List.of(
                    RolePermission.builder().id(1L).page(pagina(10L, finanzas, "panel"))
                            .role(Role.builder().id(1L).name("USER").build())
                            .canRead(true).canCreate(false).canUpdate(true).canDelete(false)
                            .active(true).build()));

            ResultDTO resultado = servicio.getPermisosDeRol("USER");

            assertThat(resultado.isCorrect()).isTrue();
            List<ResultPermisoDTO> lista = (List<ResultPermisoDTO>) resultado.getObject();
            assertThat(lista).hasSize(1);
            assertThat(lista.get(0).getModuleCode()).isEqualTo("finanzas");
            assertThat(lista.get(0).getCanUpdate()).isTrue();
        }

        @Test
        @DisplayName("un rol que no existe no tiene permisos que mirar")
        void rolInexistente() {
            when(roles.findByName("FANTASMA")).thenReturn(Optional.empty());
            assertThat(servicio.getPermisosDeRol("FANTASMA").isCorrect()).isFalse();
        }
    }

    @Nested
    @DisplayName("Guardar un permiso")
    class Guardar {

        @Test
        @DisplayName("crea la fila si no habia")
        void creaFila() {
            Module finanzas = modulo(1L, "finanzas", 1);
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(paginas.findById(10L)).thenReturn(Optional.of(pagina(10L, finanzas, "panel")));
            when(permisos.findByRoleIdAndPageId(1L, 10L)).thenReturn(Optional.empty());
            when(permisos.save(any(RolePermission.class))).thenAnswer(i -> i.getArgument(0));

            ResultDTO resultado = servicio.guardarPermiso(permisoDTO("USER", 10L, true, true, false, false));

            assertThat(resultado.isCorrect()).isTrue();
            verify(permisos).save(any(RolePermission.class));
        }

        @Test
        @DisplayName("actualiza la que ya estaba")
        void actualizaFila() {
            Module finanzas = modulo(1L, "finanzas", 1);
            RolePermission existente = RolePermission.builder().id(5L)
                    .role(Role.builder().id(1L).name("USER").build())
                    .page(pagina(10L, finanzas, "panel"))
                    .canRead(true).canCreate(false).canUpdate(false).canDelete(false)
                    .active(true).build();
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(paginas.findById(10L)).thenReturn(Optional.of(pagina(10L, finanzas, "panel")));
            when(permisos.findByRoleIdAndPageId(1L, 10L)).thenReturn(Optional.of(existente));
            when(permisos.save(any(RolePermission.class))).thenAnswer(i -> i.getArgument(0));

            servicio.guardarPermiso(permisoDTO("USER", 10L, true, true, true, true));

            assertThat(existente.getCanDelete()).isTrue();
            verify(permisos, never()).delete(any());
        }

        @Test
        @DisplayName("quitarlo todo BORRA la fila: aqui no existir es no poder")
        void quitarloTodoBorra() {
            Module finanzas = modulo(1L, "finanzas", 1);
            RolePermission existente = RolePermission.builder().id(5L)
                    .role(Role.builder().id(1L).name("USER").build())
                    .page(pagina(10L, finanzas, "panel"))
                    .canRead(true).canCreate(true).canUpdate(true).canDelete(true)
                    .active(true).build();
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(paginas.findById(10L)).thenReturn(Optional.of(pagina(10L, finanzas, "panel")));
            when(permisos.findByRoleIdAndPageId(1L, 10L)).thenReturn(Optional.of(existente));

            ResultDTO resultado = servicio.guardarPermiso(permisoDTO("USER", 10L, false, false, false, false));

            assertThat(resultado.isCorrect()).isTrue();
            verify(permisos).delete(existente);
            verify(permisos, never()).save(any());
        }

        @Test
        @DisplayName("quitarlo todo cuando no habia fila no rompe nada")
        void quitarSinFila() {
            Module finanzas = modulo(1L, "finanzas", 1);
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(paginas.findById(10L)).thenReturn(Optional.of(pagina(10L, finanzas, "panel")));
            when(permisos.findByRoleIdAndPageId(1L, 10L)).thenReturn(Optional.empty());

            assertThat(servicio.guardarPermiso(permisoDTO("USER", 10L, false, false, false, false))
                    .isCorrect()).isTrue();
            verify(permisos, never()).delete(any());
        }

        @Test
        @DisplayName("A ADMIN NO SE LE QUITA SU PROPIO MODULO")
        void adminConservaSuModulo() {
            /* La pantalla desde la que se quitaria el permiso es la que
               dejaria de existir, para todo el mundo, incluido quien pulsa. */
            Module administracion = modulo(2L, "administracion", 9);
            when(roles.findByName("ADMIN")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("ADMIN").active(true).build()));
            when(paginas.findById(20L)).thenReturn(
                    Optional.of(pagina(20L, administracion, "admin-usuarios")));

            ResultDTO resultado = servicio.guardarPermiso(
                    permisoDTO("ADMIN", 20L, false, false, false, false));

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(111);
            verify(permisos, never()).delete(any());
            verify(permisos, never()).save(any());
        }

        @Test
        @DisplayName("pero a otro rol si se le puede dar y quitar administracion")
        void otroRolSiPuede() {
            Module administracion = modulo(2L, "administracion", 9);
            when(roles.findByName("AUDITOR")).thenReturn(Optional.of(
                    Role.builder().id(3L).name("AUDITOR").active(true).build()));
            when(paginas.findById(20L)).thenReturn(
                    Optional.of(pagina(20L, administracion, "admin-usuarios")));
            when(permisos.findByRoleIdAndPageId(3L, 20L)).thenReturn(Optional.empty());
            when(permisos.save(any(RolePermission.class))).thenAnswer(i -> i.getArgument(0));

            assertThat(servicio.guardarPermiso(permisoDTO("AUDITOR", 20L, true, false, false, false))
                    .isCorrect()).isTrue();
        }

        @Test
        @DisplayName("el rol tiene que existir")
        void rolInexistente() {
            when(roles.findByName("FANTASMA")).thenReturn(Optional.empty());
            assertThat(servicio.guardarPermiso(permisoDTO("FANTASMA", 10L, true, false, false, false))
                    .isCorrect()).isFalse();
            verify(paginas, never()).findById(anyLong());
        }

        @Test
        @DisplayName("y la pagina tambien")
        void paginaInexistente() {
            when(roles.findByName("USER")).thenReturn(Optional.of(
                    Role.builder().id(1L).name("USER").active(true).build()));
            when(paginas.findById(99L)).thenReturn(Optional.empty());

            ResultDTO resultado = servicio.guardarPermiso(permisoDTO("USER", 99L, true, false, false, false));

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(110);
        }
    }
}
