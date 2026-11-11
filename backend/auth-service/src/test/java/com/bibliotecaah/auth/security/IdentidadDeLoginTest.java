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

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("De lo que se escribe en 'usuario' a la cuenta")
class IdentidadDeLoginTest {

    @Mock private UserRepository usuarios;

    private IdentidadDeLogin identidades;
    private User ana;

    @BeforeEach
    void preparar() {
        identidades = new IdentidadDeLogin(usuarios);
        ana = User.builder().id(7L).name("Ana").email("Ana@Biblioteca.ah").alias("ana").active(true).build();
    }

    @Nested
    @DisplayName("normalizar")
    class Normalizar {

        @Test
        @DisplayName("recorta y pasa a minusculas")
        void recortaYMinusculas() {
            assertThat(IdentidadDeLogin.normalizar("  AnDeRsOn ")).isEqualTo("anderson");
        }

        @Test
        @DisplayName("nulo o en blanco es null")
        void vacio() {
            assertThat(IdentidadDeLogin.normalizar(null)).isNull();
            assertThat(IdentidadDeLogin.normalizar(" \t ")).isNull();
        }
    }

    @Nested
    @DisplayName("sin @ es un alias")
    class PorAlias {

        @Test
        @DisplayName("se busca en minusculas y sin espacios, y nunca por correo")
        void minusculas() {
            when(usuarios.findByAliasAndActiveTrue("ana")).thenReturn(Optional.of(ana));

            assertThat(identidades.buscarActiva("  ANA ")).containsSame(ana);
            verify(usuarios, never()).findByEmailAndActiveTrue(anyString());
            verify(usuarios, never()).buscarActivosPorCorreoSinMayusculas(anyString());
        }

        @Test
        @DisplayName("un alias que no existe da vacio")
        void inexistente() {
            when(usuarios.findByAliasAndActiveTrue("nadie")).thenReturn(Optional.empty());

            assertThat(identidades.buscarActiva("nadie")).isEmpty();
        }
    }

    @Nested
    @DisplayName("con @ es un correo")
    class PorCorreo {

        @Test
        @DisplayName("primero tal cual (recortado): si esta, no hace falta mas")
        void exacto() {
            when(usuarios.findByEmailAndActiveTrue("Ana@Biblioteca.ah")).thenReturn(Optional.of(ana));

            assertThat(identidades.buscarActiva(" Ana@Biblioteca.ah ")).containsSame(ana);
            verify(usuarios, never()).buscarActivosPorCorreoSinMayusculas(anyString());
            verify(usuarios, never()).findByAliasAndActiveTrue(anyString());
        }

        @Test
        @DisplayName("si no, sin distinguir mayusculas cuando la coincidencia es unica")
        void sinMayusculas() {
            when(usuarios.findByEmailAndActiveTrue("ANA@BIBLIOTECA.AH")).thenReturn(Optional.empty());
            when(usuarios.buscarActivosPorCorreoSinMayusculas("ana@biblioteca.ah")).thenReturn(List.of(ana));

            assertThat(identidades.buscarActiva("ANA@BIBLIOTECA.AH")).containsSame(ana);
        }

        @Test
        @DisplayName("dos cuentas que solo difieren en mayusculas: no se elige ninguna al azar")
        void ambiguo() {
            User otra = User.builder().id(8L).email("ana@biblioteca.ah").alias("ana2").active(true).build();
            when(usuarios.findByEmailAndActiveTrue("ANA@biblioteca.ah")).thenReturn(Optional.empty());
            when(usuarios.buscarActivosPorCorreoSinMayusculas("ana@biblioteca.ah")).thenReturn(List.of(ana, otra));

            assertThat(identidades.buscarActiva("ANA@biblioteca.ah")).isEmpty();
        }

        @Test
        @DisplayName("ninguna coincidencia: vacio")
        void ninguna() {
            when(usuarios.findByEmailAndActiveTrue("x@y.z")).thenReturn(Optional.empty());
            when(usuarios.buscarActivosPorCorreoSinMayusculas("x@y.z")).thenReturn(List.of());

            assertThat(identidades.buscarActiva("x@y.z")).isEmpty();
        }
    }

    @Nested
    @DisplayName("clave del limite de intentos")
    class ClaveDelLimite {

        @Test
        @DisplayName("con cuenta: la cuenta, la misma para el correo y para el alias")
        void conCuenta() {
            assertThat(IdentidadDeLogin.claveDelLimite("ana", Optional.of(ana))).isEqualTo("cuenta:7");
            assertThat(IdentidadDeLogin.claveDelLimite("Ana@Biblioteca.ah", Optional.of(ana))).isEqualTo("cuenta:7");
        }

        @Test
        @DisplayName("sin cuenta: lo escrito normalizado")
        void sinCuenta() {
            assertThat(IdentidadDeLogin.claveDelLimite(" Nadie ", Optional.empty())).isEqualTo("identificador:nadie");
        }

        @Test
        @DisplayName("sin nada escrito: null (el limite no cuenta nada)")
        void sinNada() {
            assertThat(IdentidadDeLogin.claveDelLimite("  ", Optional.empty())).isNull();
        }
    }

    @Test
    @DisplayName("nulo o en blanco no consulta la base")
    void vacioNoConsulta() {
        assertThat(identidades.buscarActiva(null)).isEmpty();
        assertThat(identidades.buscarActiva("  ")).isEmpty();
        verifyNoInteractions(usuarios);
    }
}
