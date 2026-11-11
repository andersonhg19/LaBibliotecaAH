package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AuditoriaFilterDTO;
import com.bibliotecaah.auth.dto.output.ResultAuditoriaDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.repository.AuditLogRepository;
import com.bibliotecaah.auth.service.impl.AuditoriaListener;
import com.bibliotecaah.auth.service.impl.AuditoriaServiceImpl;
import com.bibliotecaah.auth.service.impl.RetencionDeAuditoria;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * La auditoria, y sobre todo la promesa que la sostiene: NUNCA puede estropear
 * lo que audita.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Auditoria")
class AuditoriaTest {

    @Nested
    @DisplayName("Anotar")
    class Anotar {

        @Mock private AuditLogRepository repositorio;
        @InjectMocks private AuditoriaListener listener;

        private CambioAuditable cambio(String detalle) {
            return new CambioAuditable(7L, "jefe@x.com", "User", 3L,
                    AuditLog.Accion.ROLES_ASSIGNED, detalle);
        }

        @Test
        @DisplayName("guarda quien, que, cuando y de que a que")
        void guardaLoQueImporta() {
            listener.anotar(cambio("[USER] -> [USER, ADMIN]"));

            ArgumentCaptor<AuditLog> capturado = ArgumentCaptor.forClass(AuditLog.class);
            verify(repositorio).save(capturado.capture());

            AuditLog linea = capturado.getValue();
            assertThat(linea.getActorUserId()).isEqualTo(7L);
            assertThat(linea.getActorEmail())
                    .as("el correo se guarda ademas del id: si la cuenta se borra, "
                            + "la linea tiene que seguir diciendo algo")
                    .isEqualTo("jefe@x.com");
            assertThat(linea.getAction()).isEqualTo(AuditLog.Accion.ROLES_ASSIGNED);
            assertThat(linea.getDetails()).contains("ADMIN");
            assertThat(linea.getOccurredAt()).isNotNull();
        }

        @Test
        @DisplayName("un detalle larguisimo se recorta en vez de perder la linea entera")
        void detalleLargo() {
            /* Sin el recorte, la escritura lanzaria por longitud de columna y
               se perderia el quien, el que y el cuando, que es lo que se
               consulta. */
            listener.anotar(cambio("x".repeat(5000)));

            ArgumentCaptor<AuditLog> capturado = ArgumentCaptor.forClass(AuditLog.class);
            verify(repositorio).save(capturado.capture());
            assertThat(capturado.getValue().getDetails()).hasSize(1000).endsWith("...");
        }

        @Test
        @DisplayName("un detalle nulo no es un problema")
        void detalleNulo() {
            listener.anotar(cambio(null));
            verify(repositorio).save(any(AuditLog.class));
        }

        @Test
        @DisplayName("SI LA AUDITORIA FALLA, LA OPERACION NO SE ENTERA")
        void siFallaNoRelanza() {
            /* La operacion ya esta confirmada en la base de datos cuando esto
               corre: relanzar no la desharia, solo ensuciaria el hilo. Perder
               una linea es malo; tumbar por ella algo ya confirmado es peor. */
            when(repositorio.save(any(AuditLog.class)))
                    .thenThrow(new RuntimeException("la base no responde"));

            assertThatCode(() -> listener.anotar(cambio("algo"))).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Consulta")
    class Consulta {

        @Mock private AuditLogRepository repositorio;
        @InjectMocks private AuditoriaServiceImpl servicio;

        private AuditLog linea() {
            return AuditLog.builder()
                    .id(1L).actorUserId(7L).actorEmail("jefe@x.com")
                    .entityType("User").entityId(3L)
                    .action(AuditLog.Accion.LOGIN).details("entro")
                    .occurredAt(LocalDateTime.now()).build();
        }

        @SuppressWarnings("unchecked")
        private List<ResultAuditoriaDTO> lista(ResultDTO r) {
            return (List<ResultAuditoriaDTO>) ((Map<String, Object>) r.getObject()).get("list");
        }

        @Test
        @DisplayName("devuelve las lineas paginadas")
        void devuelveLineas() {
            when(repositorio.buscar(isNull(), isNull(), isNull(), any()))
                    .thenReturn(new PageImpl<>(List.of(linea()), Pageable.ofSize(50), 1));

            ResultDTO resultado = servicio.consultar(new AuditoriaFilterDTO());

            assertThat(resultado.isCorrect()).isTrue();
            assertThat(lista(resultado)).hasSize(1);
            assertThat(lista(resultado).get(0).getAction()).isEqualTo("LOGIN");
        }

        @Test
        @DisplayName("ultimosDias se traduce a una fecha, no viaja como numero")
        void ultimosDias() {
            AuditoriaFilterDTO filtro = new AuditoriaFilterDTO();
            filtro.setUltimosDias(7);
            when(repositorio.buscar(isNull(), isNull(), any(LocalDateTime.class), any()))
                    .thenReturn(new PageImpl<>(List.of(), Pageable.ofSize(50), 0));

            servicio.consultar(filtro);

            ArgumentCaptor<LocalDateTime> desde = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(repositorio).buscar(isNull(), isNull(), desde.capture(), any());
            assertThat(desde.getValue()).isBefore(LocalDateTime.now().minusDays(6));
        }

        @Test
        @DisplayName("un tipo de entidad en blanco es no filtrar, no filtrar por vacio")
        void tipoEnBlanco() {
            AuditoriaFilterDTO filtro = new AuditoriaFilterDTO();
            filtro.setEntityType("   ");
            when(repositorio.buscar(isNull(), isNull(), isNull(), any()))
                    .thenReturn(new PageImpl<>(List.of(), Pageable.ofSize(50), 0));

            servicio.consultar(filtro);

            verify(repositorio).buscar(isNull(), isNull(), isNull(), any());
        }
    }

    @Nested
    @DisplayName("Retencion")
    class Retencion {

        @Mock private AuditLogRepository repositorio;
        @InjectMocks private RetencionDeAuditoria retencion;

        @Test
        @DisplayName("borra lo anterior al plazo configurado")
        void borraLoViejo() {
            ReflectionTestUtils.setField(retencion, "diasQueSeGuardan", 30);
            when(repositorio.borrarAnterioresA(any(LocalDateTime.class))).thenReturn(12);

            retencion.limpiar();

            ArgumentCaptor<LocalDateTime> limite = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(repositorio).borrarAnterioresA(limite.capture());
            assertThat(limite.getValue()).isBefore(LocalDateTime.now().minusDays(29));
        }

        @Test
        @DisplayName("UN PLAZO DE CERO NO VACIA LA TABLA")
        void plazoCero() {
            /* Si alguien se equivoca configurando, la respuesta correcta es no
               hacer nada y decirlo en el log, no borrar el historico entero en
               el primer pase de madrugada. */
            ReflectionTestUtils.setField(retencion, "diasQueSeGuardan", 0);

            retencion.limpiar();

            verify(repositorio, never()).borrarAnterioresA(any());
        }

        @Test
        @DisplayName("ni un plazo negativo")
        void plazoNegativo() {
            ReflectionTestUtils.setField(retencion, "diasQueSeGuardan", -5);
            retencion.limpiar();
            verify(repositorio, never()).borrarAnterioresA(any());
        }
    }
}
