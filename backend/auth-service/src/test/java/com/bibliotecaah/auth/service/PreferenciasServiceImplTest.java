package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.AppConfigSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultAppConfigDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultPreferenciasDTO;
import com.bibliotecaah.auth.entity.AppConfiguration;
import com.bibliotecaah.auth.repository.AppConfigurationRepository;
import com.bibliotecaah.auth.service.impl.PreferenciasServiceImpl;
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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Preferencias y ajustes de la instalacion")
class PreferenciasServiceImplTest {

    @Mock private AppConfigurationRepository configuracion;

    @InjectMocks private PreferenciasServiceImpl servicio;

    private void ajuste(String clave, String valor) {
        when(configuracion.findByConfigKeyAndActiveTrue(clave)).thenReturn(
                Optional.of(AppConfiguration.builder().configKey(clave).value(valor).active(true).build()));
    }

    @Nested
    @DisplayName("misPreferencias")
    class Mias {

        @Test
        @DisplayName("devuelve lo configurado")
        void loConfigurado() {
            ajuste("app.name", "Mi biblioteca");
            ajuste("app.locale", "es-ES");

            ResultPreferenciasDTO p = (ResultPreferenciasDTO) servicio.misPreferencias().getObject();

            assertThat(p.getAppName()).isEqualTo("Mi biblioteca");
            assertThat(p.getLocale()).isEqualTo("es-ES");
        }

        @Test
        @DisplayName("sin configuracion (o en blanco) usa los valores de emergencia")
        void deEmergencia() {
            when(configuracion.findByConfigKeyAndActiveTrue("app.name")).thenReturn(Optional.empty());
            ajuste("app.locale", "  ");

            ResultPreferenciasDTO p = (ResultPreferenciasDTO) servicio.misPreferencias().getObject();

            assertThat(p.getAppName()).isEqualTo("La Biblioteca AH");
            assertThat(p.getLocale()).isEqualTo("es-CO");
        }
    }

    @Nested
    @DisplayName("configuracion global")
    class Global {

        @Test
        @DisplayName("lista los ajustes")
        void lista() {
            when(configuracion.findAllByOrderByConfigKeyAsc()).thenReturn(List.of(
                    AppConfiguration.builder().id(1L).configKey("app.name").value("X").active(true).build()));

            @SuppressWarnings("unchecked")
            List<ResultAppConfigDTO> lista = (List<ResultAppConfigDTO>) servicio.getConfiguracion().getObject();

            assertThat(lista).extracting(ResultAppConfigDTO::getConfigKey).containsExactly("app.name");
        }

        @Test
        @DisplayName("guarda un ajuste nuevo")
        void guardaNuevo() {
            when(configuracion.findByConfigKey("app.tema")).thenReturn(Optional.empty());

            ResultDTO r = servicio.guardarConfiguracion(new AppConfigSaveDTO(" app.tema ", " roble ", "Tema"));

            assertThat(r.isCorrect()).isTrue();
            ResultAppConfigDTO dto = (ResultAppConfigDTO) r.getObject();
            assertThat(dto.getConfigKey()).isEqualTo("app.tema");
            assertThat(dto.getValue()).isEqualTo("roble");
            assertThat(dto.getDescription()).isEqualTo("Tema");
            verify(configuracion).save(any(AppConfiguration.class));
        }

        @Test
        @DisplayName("actualiza uno existente sin pisar la descripcion si no llega")
        void actualiza() {
            AppConfiguration existente = AppConfiguration.builder().id(1L).configKey("app.name")
                    .value("Viejo").description("Nombre").active(true).build();
            when(configuracion.findByConfigKey("app.name")).thenReturn(Optional.of(existente));

            servicio.guardarConfiguracion(new AppConfigSaveDTO("app.name", "Nuevo", null));

            assertThat(existente.getValue()).isEqualTo("Nuevo");
            assertThat(existente.getDescription()).isEqualTo("Nombre");
        }
    }
}
