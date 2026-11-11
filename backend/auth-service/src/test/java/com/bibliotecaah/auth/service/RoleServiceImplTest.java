package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.RoleSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultRoleDTO;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.impl.RoleServiceImpl;
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
@DisplayName("Administracion de roles")
class RoleServiceImplTest {

    @Mock private RoleRepository roleRepository;
    @Mock private UserRepository userRepository;
    @Mock private org.springframework.context.ApplicationEventPublisher eventos;

    @InjectMocks private RoleServiceImpl servicio;

    private static Role rol(Long id, String nombre) {
        return Role.builder().id(id).name(nombre).description("d").active(true).build();
    }

    private static RoleSaveDTO dto(Long id, String nombre, Boolean activo) {
        RoleSaveDTO d = new RoleSaveDTO();
        d.setId(id);
        d.setName(nombre);
        d.setDescription("descripcion");
        d.setActive(activo);
        return d;
    }

    @SuppressWarnings("unchecked")
    private static List<ResultRoleDTO> lista(ResultDTO resultado) {
        return (List<ResultRoleDTO>) resultado.getObject();
    }

    @Test
    @DisplayName("el listado dice cuantas cuentas lleva cada rol")
    void listado() {
        when(roleRepository.findAll()).thenReturn(List.of(rol(2L, "USER"), rol(1L, "ADMIN")));
        when(userRepository.contarActivosConRolId(1L)).thenReturn(2L);
        when(userRepository.contarActivosConRolId(2L)).thenReturn(7L);

        ResultDTO resultado = servicio.getAll();

        assertThat(resultado.isCorrect()).isTrue();
        assertThat(lista(resultado)).extracting(ResultRoleDTO::getName)
                .as("ordenado por nombre")
                .containsExactly("ADMIN", "USER");
        assertThat(lista(resultado).get(0).getUsuarios()).isEqualTo(2L);
    }

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("crea un rol nuevo, activo por defecto")
        void creaNuevo() {
            when(roleRepository.existsByName("CONTABLE")).thenReturn(false);
            when(roleRepository.save(any(Role.class))).thenAnswer(i -> {
                Role r = i.getArgument(0);
                r.setId(9L);
                return r;
            });
            when(userRepository.contarActivosConRolId(9L)).thenReturn(0L);

            ResultDTO resultado = servicio.saveAndUpdate(dto(null, "CONTABLE", null));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(((ResultRoleDTO) resultado.getObject()).getActive()).isTrue();
        }

        @Test
        @DisplayName("un nombre repetido no pasa")
        void nombreRepetido() {
            when(roleRepository.existsByName("ADMIN")).thenReturn(true);
            assertThat(servicio.saveAndUpdate(dto(null, "ADMIN", null)).isCorrect()).isFalse();
            verify(roleRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Modificacion")
    class Modificacion {

        @Test
        @DisplayName("renombra un rol propio")
        void renombra() {
            when(roleRepository.findById(9L)).thenReturn(Optional.of(rol(9L, "CONTABLE")));
            when(roleRepository.existsByName("TESORERO")).thenReturn(false);
            when(roleRepository.save(any(Role.class))).thenAnswer(i -> i.getArgument(0));
            when(userRepository.contarActivosConRolId(9L)).thenReturn(0L);

            ResultDTO resultado = servicio.saveAndUpdate(dto(9L, "TESORERO", true));

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(((ResultRoleDTO) resultado.getObject()).getName()).isEqualTo("TESORERO");
        }

        @Test
        @DisplayName("un rol que no existe no se modifica")
        void inexistente() {
            when(roleRepository.findById(9L)).thenReturn(Optional.empty());
            assertThat(servicio.saveAndUpdate(dto(9L, "LOQUESEA", true)).isCorrect()).isFalse();
        }

        @Test
        @DisplayName("ADMIN NO SE RENOMBRA: hay reglas de seguridad escritas contra ese nombre")
        void adminNoSeRenombra() {
            /* El SecurityConfig de los tres servicios compara contra la cadena
               "ADMIN". Renombrarlo dejaria esas reglas apuntando a un rol que
               ya no existe, y una regla que no coincide con nadie no falla:
               se salta. */
            when(roleRepository.findById(1L)).thenReturn(Optional.of(rol(1L, "ADMIN")));

            ResultDTO resultado = servicio.saveAndUpdate(dto(1L, "ADMINISTRADOR", true));

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(108);
            verify(roleRepository, never()).save(any());
        }

        @Test
        @DisplayName("ni se desactiva")
        void adminNoSeDesactiva() {
            when(roleRepository.findById(1L)).thenReturn(Optional.of(rol(1L, "ADMIN")));
            assertThat(servicio.saveAndUpdate(dto(1L, "ADMIN", false)).isCorrect()).isFalse();
            verify(roleRepository, never()).save(any());
        }

        @Test
        @DisplayName("USER tampoco: es el rol que recibe toda cuenta nueva")
        void userTampoco() {
            when(roleRepository.findById(2L)).thenReturn(Optional.of(rol(2L, "USER")));
            assertThat(servicio.saveAndUpdate(dto(2L, "USUARIO", true)).isCorrect()).isFalse();
        }

        @Test
        @DisplayName("pero SI se le puede cambiar la descripcion a un rol del sistema")
        void descripcionDelSistemaSi() {
            when(roleRepository.findById(1L)).thenReturn(Optional.of(rol(1L, "ADMIN")));
            when(roleRepository.save(any(Role.class))).thenAnswer(i -> i.getArgument(0));
            when(userRepository.contarActivosConRolId(1L)).thenReturn(1L);

            assertThat(servicio.saveAndUpdate(dto(1L, "ADMIN", true)).isCorrect()).isTrue();
        }

        @Test
        @DisplayName("no se le puede poner el nombre de otro rol que ya existe")
        void chocaConOtro() {
            when(roleRepository.findById(9L)).thenReturn(Optional.of(rol(9L, "CONTABLE")));
            when(roleRepository.existsByName("TESORERO")).thenReturn(true);

            assertThat(servicio.saveAndUpdate(dto(9L, "TESORERO", true)).isCorrect()).isFalse();
        }
    }

    @Nested
    @DisplayName("Retirada")
    class Retirada {

        @Test
        @DisplayName("desactiva, nunca borra")
        void desactiva() {
            when(roleRepository.findById(9L)).thenReturn(Optional.of(rol(9L, "CONTABLE")));
            when(userRepository.contarActivosConRolId(9L)).thenReturn(0L);
            when(roleRepository.save(any(Role.class))).thenAnswer(i -> i.getArgument(0));

            ResultDTO resultado = servicio.desactivar(9L);

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(((ResultRoleDTO) resultado.getObject()).getActive()).isFalse();
            verify(roleRepository, never()).delete(any());
            verify(roleRepository, never()).deleteById(anyLong());
        }

        @Test
        @DisplayName("un rol que alguien lleva puesto no se retira")
        void enUso() {
            when(roleRepository.findById(9L)).thenReturn(Optional.of(rol(9L, "CONTABLE")));
            when(userRepository.contarActivosConRolId(9L)).thenReturn(3L);

            ResultDTO resultado = servicio.desactivar(9L);

            assertThat(resultado.isCorrect()).isFalse();
            assertThat(resultado.getErrorCode()).isEqualTo(109);
        }

        @Test
        @DisplayName("los roles del sistema no se retiran")
        void delSistema() {
            when(roleRepository.findById(1L)).thenReturn(Optional.of(rol(1L, "ADMIN")));
            assertThat(servicio.desactivar(1L).isCorrect()).isFalse();
        }

        @Test
        @DisplayName("y el que no existe, tampoco")
        void inexistente() {
            when(roleRepository.findById(9L)).thenReturn(Optional.empty());
            assertThat(servicio.desactivar(9L).isCorrect()).isFalse();
        }
    }
}
