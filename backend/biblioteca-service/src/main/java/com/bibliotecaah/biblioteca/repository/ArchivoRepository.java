package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Archivo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ArchivoRepository extends JpaRepository<Archivo, UUID> {

    Optional<Archivo> findBySha256(String sha256);

    List<Archivo> findByEstadoConversionAndMetadatosAplicadosFalse(String estadoConversion);
}
