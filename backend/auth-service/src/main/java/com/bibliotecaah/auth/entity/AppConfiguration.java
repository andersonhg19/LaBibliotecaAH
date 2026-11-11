package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Un ajuste de la instalacion entera.
 *
 * Clave-valor a proposito: lo que se guarda aqui son cosas que se consultan de
 * una en una y cambian una vez al ano —el nombre de la app, el
 * idioma—, no datos con estructura. Modelar cada ajuste como una columna
 * obligaria a una migracion por ajuste nuevo.
 *
 * Lo que NO va aqui: secretos y contrasenas. Eso son variables de entorno; una
 * tabla que se puede leer desde una pantalla de administracion es el peor sitio
 * para guardarlos.
 */
@Entity
@Table(name = "bah_auth_app_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class AppConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    /* "key" es palabra reservada en varios motores; la columna se llama
       config_key para que la migracion valga igual en PostgreSQL y en H2. */
    @Column(name = "config_key", nullable = false, unique = true, length = 80)
    private String configKey;

    /* Igual que la clave: "value" es palabra reservada en H2 —la migracion
       fallaba con un error de sintaxis— asi que la columna se llama
       config_value y el campo conserva el nombre util. */
    @Column(name = "config_value", nullable = false, length = 300)
    private String value;

    @Column(length = 300)
    private String description;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
