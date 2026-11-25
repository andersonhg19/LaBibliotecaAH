package com.bibliotecaah.biblioteca.service.impl;

import com.bibliotecaah.biblioteca.dto.input.DiarioDTO;
import com.bibliotecaah.biblioteca.dto.input.EventoDiarioDTO;
import com.bibliotecaah.biblioteca.entity.Archivo;
import com.bibliotecaah.biblioteca.entity.Ejemplar;
import com.bibliotecaah.biblioteca.enums.Message;
import com.bibliotecaah.biblioteca.enums.TipoEjemplar;
import com.bibliotecaah.biblioteca.exception.ValidationException;
import com.bibliotecaah.biblioteca.repository.DiarioRepository;
import com.bibliotecaah.biblioteca.util.LimitadorPorUsuario;
import com.bibliotecaah.biblioteca.util.ValidationUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("Mejoras 0.5.0: piezas sin base de datos")
class Mejoras050UnitariaTest {

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("C10.1: que cuenta como avance")
    class Avance {

        @Test
        @DisplayName("sin progreso previo: solo si el capitulo o el porcentaje pasan de 0")
        void sinPrevio() {
            assertThat(ProgresoServiceImpl.avanza(true, null, null, 0, 0.0)).isFalse();
            assertThat(ProgresoServiceImpl.avanza(true, null, null, 1, 0.0)).isTrue();
            assertThat(ProgresoServiceImpl.avanza(true, null, null, 0, 0.01)).isTrue();
        }

        @Test
        @DisplayName("con progreso previo: otro capitulo o mas de 0,001 de porcentaje; el mismo punto no")
        void conPrevio() {
            assertThat(ProgresoServiceImpl.avanza(false, 3, 20.0, 3, 20.0)).isFalse();
            assertThat(ProgresoServiceImpl.avanza(false, 3, 20.0, 3, 20.0009)).isFalse();
            assertThat(ProgresoServiceImpl.avanza(false, 3, 20.0, 3, 20.002)).isTrue();
            assertThat(ProgresoServiceImpl.avanza(false, 3, 20.0, 3, 10.0)).isFalse();
            assertThat(ProgresoServiceImpl.avanza(false, 3, 20.0, 2, 10.0)).as("volver a otro capitulo").isTrue();
            assertThat(ProgresoServiceImpl.avanza(false, null, null, 0, 0.0)).as("previo con nulos = 0/0").isFalse();
        }
    }

    @Nested
    @DisplayName("C10.2: orden de encolado")
    class Orden {

        @Test
        @DisplayName("de desde al final y despues los anteriores; desde fuera de rango = todos en orden")
        void enOrden() {
            assertThat(AudioServiceImpl.enOrden(List.of(1, 2, 3, 5), 3)).containsExactly(3, 5, 1, 2);
            assertThat(AudioServiceImpl.enOrden(List.of(5, 1, 3, 2), 4)).containsExactly(5, 1, 2, 3);
            assertThat(AudioServiceImpl.enOrden(List.of(1, 2, 3), 0)).containsExactly(1, 2, 3);
            assertThat(AudioServiceImpl.enOrden(List.of(1, 2, 3), 9)).containsExactly(1, 2, 3);
            assertThat(AudioServiceImpl.enOrden(List.of(), 2)).isEmpty();
        }
    }

    @Nested
    @DisplayName("C11: el archivo o un 120 claro")
    class ArchivoDe {

        @Test
        @DisplayName("con archivo lo devuelve; libro sin archivo -> libroSoloRegistro; deseo -> libroSinArchivo")
        void archivoDe() {
            Archivo a = Archivo.builder().id(UUID.randomUUID()).build();
            assertThat(ValidationUtils.archivoDe(Ejemplar.builder().tipo(TipoEjemplar.LIBRO).archivo(a).build())).isSameAs(a);
            assertThatThrownBy(() -> ValidationUtils.archivoDe(Ejemplar.builder().tipo(TipoEjemplar.LIBRO).build()))
                    .isInstanceOfSatisfying(ValidationException.class, e -> {
                        assertThat(e.getClave()).isEqualTo(Message.Msj.libroSoloRegistro);
                        assertThat(e.getCodigo()).isEqualTo(120);
                    });
            assertThatThrownBy(() -> ValidationUtils.archivoDe(Ejemplar.builder().tipo(TipoEjemplar.DESEO).build()))
                    .isInstanceOfSatisfying(ValidationException.class,
                            e -> assertThat(e.getClave()).isEqualTo(Message.Msj.libroSinArchivo));
            assertThatThrownBy(() -> ValidationUtils.archivoDe(Ejemplar.builder().tipo(TipoEjemplar.DOCUMENTO).build()))
                    .isInstanceOfSatisfying(ValidationException.class,
                            e -> assertThat(e.getClave()).isEqualTo(Message.Msj.libroSoloRegistro));
        }
    }

    @Nested
    @DisplayName("C9: tope parcial y contexto")
    class Diario {

        private final Instant[] ahora = {Instant.parse("2026-11-25T20:00:00Z")};
        private final Clock reloj = new Clock() {
            @Override
            public ZoneOffset getZone() {
                return ZoneOffset.UTC;
            }

            @Override
            public Clock withZone(java.time.ZoneId zona) {
                return this;
            }

            @Override
            public Instant instant() {
                return ahora[0];
            }
        };

        @Test
        @DisplayName("consumirHasta apunta lo que quepa, nada si esta lleno, y la ventana lo libera")
        void consumirHasta() {
            LimitadorPorUsuario l = new LimitadorPorUsuario(10, Duration.ofHours(1), reloj);
            assertThat(l.consumirHasta(1L, 6)).isEqualTo(6);
            assertThat(l.consumirHasta(1L, 6)).isEqualTo(4);
            assertThat(l.consumirHasta(1L, 1)).isZero();
            assertThat(l.consumirHasta(2L, 3)).as("cada usuario con su cupo").isEqualTo(3);
            ahora[0] = ahora[0].plus(Duration.ofHours(1));
            assertThat(l.consumirHasta(1L, 3)).isEqualTo(3);
        }

        @Test
        @DisplayName("lote que no cabe en el tope: no toca la base y responde 0")
        void sinCupo() {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("u9", null, List.of());
            auth.setDetails(9L);
            SecurityContextHolder.getContext().setAuthentication(auth);
            DiarioRepository repo = mock(DiarioRepository.class);
            LimitadorPorUsuario tope = new LimitadorPorUsuario(1, Duration.ofHours(1), reloj);
            DiarioServiceImpl s = new DiarioServiceImpl(repo, new ObjectMapper(), tope);
            EventoDiarioDTO e = EventoDiarioDTO.builder().cuando(ahora[0]).tipo("inicio").build();
            when(repo.ejemplaresDelUsuario(any(), any())).thenReturn(java.util.Set.of());
            assertThat(s.guardar(DiarioDTO.builder().eventos(List.of(e, e)).build()).getGuardados()).isEqualTo(1);
            assertThat(s.guardar(DiarioDTO.builder().eventos(List.of(e)).build()).getGuardados()).isZero();
            verify(repo).guardar(any());
        }

        @Test
        @DisplayName("contexto: null pasa como null; plano se serializa; ua de otro tipo no se mide como texto")
        void contexto() {
            DiarioServiceImpl s = new DiarioServiceImpl(mock(DiarioRepository.class), new ObjectMapper(),
                    new LimitadorPorUsuario(1, Duration.ofHours(1), reloj));
            assertThat(s.contexto(null, 0)).isNull();
            assertThat(s.contexto(new java.util.TreeMap<>(Map.of("red", true, "n", 3)), 0)).isEqualTo("{\"n\":3,\"red\":true}");
            assertThat(s.contexto(Map.of("ua", 5), 0)).isEqualTo("{\"ua\":5}");
            assertThatThrownBy(() -> s.contexto(Map.of("x", List.of()), 2)).isInstanceOf(ValidationException.class);
            assertThat(DiarioServiceImpl.deUnaLinea("a\r\nb\tc")).isEqualTo("a  b c");
            assertThat(DiarioServiceImpl.deUnaLinea(null)).isNull();
        }
    }
}
