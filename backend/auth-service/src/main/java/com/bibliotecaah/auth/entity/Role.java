package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Un rol: el conjunto de cosas que alguien puede hacer.
 *
 * Hasta la ola 4 esto no existia. La ola 2 resolvio "quien eres" sacando el
 * userId del token; la pregunta que quedaba sin responder era "y que puedes
 * hacer", y la respuesta de los tres servicios era la misma para todos:
 * cualquier peticion con un token valido pasaba a cualquier endpoint.
 *
 * DOS DECISIONES QUE SE VEN AQUI, y las dos vienen de leer el mismo modelo mal
 * resuelto en otros dos proyectos:
 *
 *  1. El rol tiene active y fechas de auditoria. Un rol sin active no se puede
 *     retirar sin borrarlo, y borrar un rol que alguien tiene asignado es
 *     justo lo que no se debe poder hacer.
 *
 *  2. equals/hashCode van SOLO por id (onlyExplicitlyIncluded). Con @Data de
 *     Lombok —que es lo que hay en los proyectos de referencia— la comparacion
 *     entra en todos los campos: dos roles recien creados sin id salen
 *     "iguales", y comparar dentro de un Set fuerza la carga de lo perezoso.
 */
@Entity
@Table(name = "bah_auth_role")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    /**
     * El nombre es el que viaja en el token y el que se compara en
     * hasAuthority(...). Se guarda en mayusculas y sin prefijo ROLE_: el
     * prefijo solo lo exige hasRole(), y aqui se usa hasAuthority() a
     * proposito para que lo que se escribe sea exactamente lo que se compara.
     */
    @Column(nullable = false, unique = true, length = 50)
    private String name;

    @Column(length = 200)
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
