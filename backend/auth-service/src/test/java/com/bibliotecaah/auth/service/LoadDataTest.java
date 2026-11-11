package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.impl.LoadData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Semilla de cuentas desde variables de entorno")
class LoadDataTest {

    @Mock private UserRepository userRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks private LoadData loadData;

    @BeforeEach
    void base() {
        ReflectionTestUtils.setField(loadData, "seedDataEnabled", true);
        lenient().when(passwordEncoder.encode(anyString())).thenReturn("encoded");
        lenient().when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        lenient().when(roleRepository.findByNameAndActiveTrue("ADMIN"))
                .thenReturn(Optional.of(Role.builder().id(1L).name("ADMIN").active(true).build()));
        lenient().when(roleRepository.findByNameAndActiveTrue("USER"))
                .thenReturn(Optional.of(Role.builder().id(2L).name("USER").active(true).build()));
    }

    private void claves(String admin, String anderson, String samy) {
        ReflectionTestUtils.setField(loadData, "adminPassword", admin);
        ReflectionTestUtils.setField(loadData, "andersonPassword", anderson);
        ReflectionTestUtils.setField(loadData, "samyPassword", samy);
    }

    @Test
    @DisplayName("con las tres variables crea admin, anderson (ADMIN+USER) y samy (USER)")
    void creaLasTres() {
        claves("ClaveAdmin1", "ClaveAnderson1", "ClaveSamy1");

        loadData.run();

        verify(userRepository).save(argThat(u -> u.getEmail().equals("admin@biblioteca.ah")
                && u.getAlias().equals("admin") && u.tieneRol("ADMIN") && u.tieneRol("USER")));
        verify(userRepository).save(argThat(u -> u.getEmail().equals("anderson@biblioteca.ah")
                && u.getAlias().equals("anderson") && u.tieneRol("ADMIN") && u.tieneRol("USER")));
        verify(userRepository).save(argThat(u -> u.getEmail().equals("samy@biblioteca.ah")
                && u.getAlias().equals("samy") && !u.tieneRol("ADMIN") && u.tieneRol("USER")));
    }

    @Test
    @DisplayName("si el alias de la semilla ya es de otra cuenta, usa el primer alias-N libre y no tumba el arranque")
    void aliasOcupado() {
        claves(null, null, "ClaveSamy1");
        when(userRepository.existsByAlias("samy")).thenReturn(true);
        when(userRepository.existsByAlias("samy-2")).thenReturn(true);
        when(userRepository.existsByAlias("samy-3")).thenReturn(false);

        loadData.run();

        verify(userRepository).save(argThat(u -> u.getEmail().equals("samy@biblioteca.ah")
                && u.getAlias().equals("samy-3")));
    }

    @Test
    @DisplayName("si falta la variable de una cuenta, esa cuenta no se crea y las demas si")
    void sinVariableNoSeCrea() {
        claves("ClaveAdmin1", "", null);

        loadData.run();

        verify(userRepository, times(1)).save(any(User.class));
        verify(userRepository).save(argThat(u -> u.getEmail().equals("admin@biblioteca.ah")));
    }

    @Test
    @DisplayName("una cuenta que ya existe no se toca")
    void yaExiste() {
        claves("ClaveAdmin1", "ClaveAnderson1", "ClaveSamy1");
        when(userRepository.findByEmail(anyString()))
                .thenReturn(Optional.of(User.builder().id(9L).email("x").build()));

        loadData.run();

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    @DisplayName("si la migracion no dejo los roles, la semilla sigue en vez de tumbar el arranque")
    void sinRolesLaSemillaNoRompe() {
        claves("ClaveAdmin1", "ClaveAnderson1", "ClaveSamy1");
        when(roleRepository.findByNameAndActiveTrue(anyString())).thenReturn(Optional.empty());

        loadData.run();

        verify(userRepository, times(3)).save(argThat(u -> u.getRoles().isEmpty()));
    }

    @Test
    @DisplayName("desactivada, no consulta nada")
    void desactivada() {
        ReflectionTestUtils.setField(loadData, "seedDataEnabled", false);

        loadData.run();

        verify(userRepository, never()).findByEmail(anyString());
        verify(userRepository, never()).save(any(User.class));
    }
}
