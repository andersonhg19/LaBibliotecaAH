package com.bibliotecaah.auth.security;

import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Carga de la cuenta para comprobar la clave")
class MyUserDetailsServiceTest {

    @Mock private UserRepository userRepository;

    private MyUserDetailsService servicio;
    private User ana;

    @BeforeEach
    void setUp() {
        servicio = new MyUserDetailsService(new IdentidadDeLogin(userRepository));
        ana = User.builder()
                .id(1L).name("Ana").email("ana@biblioteca.ah").alias("ana")
                .password("cifrada").active(true)
                .build();
    }

    @Nested
    @DisplayName("loadUserByUsername")
    class Carga {

        @Test
        @DisplayName("por alias: el UserDetails lleva el CORREO como nombre y la clave cifrada")
        void porAlias() {
            when(userRepository.findByAliasAndActiveTrue("ana")).thenReturn(Optional.of(ana));

            UserDetails detalles = servicio.loadUserByUsername("Ana");

            assertEquals("ana@biblioteca.ah", detalles.getUsername());
            assertEquals("cifrada", detalles.getPassword());
            assertTrue(detalles.isEnabled());
            assertTrue(detalles.isAccountNonExpired());
            assertTrue(detalles.isAccountNonLocked());
            assertTrue(detalles.isCredentialsNonExpired());
            assertTrue(detalles.getAuthorities().isEmpty());
        }

        @Test
        @DisplayName("por correo exacto")
        void porCorreo() {
            when(userRepository.findByEmailAndActiveTrue("ana@biblioteca.ah")).thenReturn(Optional.of(ana));

            assertEquals("ana@biblioteca.ah", servicio.loadUserByUsername("ana@biblioteca.ah").getUsername());
        }

        @Test
        @DisplayName("inexistente: UsernameNotFoundException sin repetir lo escrito")
        void inexistente() {
            when(userRepository.findByAliasAndActiveTrue("nadie")).thenReturn(Optional.empty());

            UsernameNotFoundException error = assertThrows(UsernameNotFoundException.class,
                    () -> servicio.loadUserByUsername("nadie"));

            assertEquals("No hay cuenta activa con ese correo o usuario", error.getMessage());
        }

        @Test
        @DisplayName("desactivada: tampoco se encuentra (solo se buscan activas)")
        void desactivada() {
            when(userRepository.findByEmailAndActiveTrue("vieja@biblioteca.ah")).thenReturn(Optional.empty());
            when(userRepository.buscarActivosPorCorreoSinMayusculas("vieja@biblioteca.ah")).thenReturn(List.of());

            assertThrows(UsernameNotFoundException.class,
                    () -> servicio.loadUserByUsername("vieja@biblioteca.ah"));
        }

        @Test
        @DisplayName("vacio o nulo: no consulta la base")
        void vacio() {
            assertThrows(UsernameNotFoundException.class, () -> servicio.loadUserByUsername(null));
            assertThrows(UsernameNotFoundException.class, () -> servicio.loadUserByUsername("   "));
            verifyNoInteractions(userRepository);
        }
    }
}
