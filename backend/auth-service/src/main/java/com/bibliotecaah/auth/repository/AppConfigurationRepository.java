package com.bibliotecaah.auth.repository;

import com.bibliotecaah.auth.entity.AppConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppConfigurationRepository extends JpaRepository<AppConfiguration, Long> {

    Optional<AppConfiguration> findByConfigKey(String configKey);

    Optional<AppConfiguration> findByConfigKeyAndActiveTrue(String configKey);

    List<AppConfiguration> findAllByOrderByConfigKeyAsc();
}
