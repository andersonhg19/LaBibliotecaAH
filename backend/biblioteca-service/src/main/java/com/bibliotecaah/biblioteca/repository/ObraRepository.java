package com.bibliotecaah.biblioteca.repository;

import com.bibliotecaah.biblioteca.entity.Obra;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ObraRepository extends JpaRepository<Obra, UUID> {
}
