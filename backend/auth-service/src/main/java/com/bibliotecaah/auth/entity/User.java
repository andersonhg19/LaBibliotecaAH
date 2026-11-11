package com.bibliotecaah.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "bah_auth_user")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    /**
     * Los roles de esta persona.
     *
     * PEREZOSO Y SIN CASCADA, y las dos cosas a proposito. En los proyectos que
     * sirvieron de referencia esta relacion esta declarada EAGER y con
     * CascadeType.ALL: lo primero arrastra los roles en cada consulta de
     * usuario aunque solo se quiera el nombre, y lo segundo hace que borrar un
     * usuario intente borrar los roles, que son de todos.
     *
     * Como es perezoso, quien necesite los roles fuera de una transaccion los
     * pide explicitamente con findByEmailAndActiveTrueWithRoles.
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "bah_auth_user_role",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public boolean tieneRol(String nombreDelRol) {
        return roles != null && roles.stream()
                .anyMatch(r -> Boolean.TRUE.equals(r.getActive()) && r.getName().equals(nombreDelRol));
    }
}
