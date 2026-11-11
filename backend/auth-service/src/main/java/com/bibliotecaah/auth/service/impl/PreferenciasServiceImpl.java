package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.AppConfigSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultAppConfigDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultPreferenciasDTO;
import com.bibliotecaah.auth.entity.AppConfiguration;
import com.bibliotecaah.auth.repository.AppConfigurationRepository;
import com.bibliotecaah.auth.service.PreferenciasService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Los ajustes de la instalacion (clave-valor) y lo que de ellos necesita la web.
 *
 * Las preferencias de lectura de cada persona (voz, velocidad, tema del lector)
 * NO viven aqui: son del dominio y las guarda biblioteca-service.
 */
@Slf4j
@Service
public class PreferenciasServiceImpl implements PreferenciasService {

    static final String CLAVE_NOMBRE = "app.name";
    static final String CLAVE_LOCALE = "app.locale";

    /* Ultimo recurso si la tabla de configuracion estuviera vacia. */
    static final String NOMBRE_DE_EMERGENCIA = "La Biblioteca AH";
    static final String LOCALE_DE_EMERGENCIA = "es-CO";

    private final AppConfigurationRepository configuracion;

    public PreferenciasServiceImpl(AppConfigurationRepository configuracion) {
        this.configuracion = configuracion;
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO misPreferencias() {
        return new ResultDTO(new ResultPreferenciasDTO(
                valorDe(CLAVE_NOMBRE, NOMBRE_DE_EMERGENCIA),
                valorDe(CLAVE_LOCALE, LOCALE_DE_EMERGENCIA)));
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getConfiguracion() {
        List<ResultAppConfigDTO> lista = configuracion.findAllByOrderByConfigKeyAsc().stream()
                .map(c -> new ResultAppConfigDTO(c.getId(), c.getConfigKey(), c.getValue(),
                        c.getDescription(), c.getActive()))
                .toList();
        return new ResultDTO(lista);
    }

    @Override
    @Transactional
    public ResultDTO guardarConfiguracion(AppConfigSaveDTO dto) {
        String clave = dto.getConfigKey().trim();

        AppConfiguration ajuste = configuracion.findByConfigKey(clave)
                .orElseGet(() -> AppConfiguration.builder().configKey(clave).active(true).build());
        ajuste.setValue(dto.getValue().trim());
        if (dto.getDescription() != null) {
            ajuste.setDescription(dto.getDescription());
        }
        configuracion.save(ajuste);

        log.info("Configuracion {} = {}", clave, ajuste.getValue());
        return new ResultDTO(new ResultAppConfigDTO(ajuste.getId(), ajuste.getConfigKey(),
                ajuste.getValue(), ajuste.getDescription(), ajuste.getActive()));
    }

    private String valorDe(String clave, String siNoEsta) {
        return configuracion.findByConfigKeyAndActiveTrue(clave)
                .map(AppConfiguration::getValue)
                .filter(v -> !v.isBlank())
                .orElse(siNoEsta);
    }
}
