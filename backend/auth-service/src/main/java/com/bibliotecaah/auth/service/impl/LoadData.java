package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/**
 * Las tres cuentas con las que nace La Biblioteca AH.
 *
 * SIN CONTRASENAS EN EL CODIGO. En Oh Churus cada cuenta tenia una contrasena
 * de demostracion por defecto ("Admin123!"); si alguien olvidaba la variable de
 * entorno en produccion, la cuenta de administrador nacia con una clave que esta
 * escrita en el repositorio. Aqui, si falta la variable de una cuenta, esa
 * cuenta NO se crea y queda un WARN en el log. Las demas siguen su camino.
 *
 * Cada cuenta nace con su alias (V3): admin, anderson, samy. Si el alias ya lo
 * tiene otra cuenta (alguien se registro con "samy" antes de que se anadiera la
 * variable de Samy), la semilla no tumba el arranque: usa "samy-2", "samy-3"...
 * y lo deja en el log. A las cuentas que ya existian les pone el alias la
 * migracion V3.
 *
 * Cada cuenta se crea solo si su correo no existe: arrancar dos veces no
 * duplica nada, y anadir la variable de Samy despues de haber arrancado una vez
 * la crea en el siguiente arranque sin tocar las otras.
 */
@Slf4j
@Component
public class LoadData implements CommandLineRunner {

    static final String CORREO_ADMIN = "admin@biblioteca.ah";
    static final String CORREO_ANDERSON = "anderson@biblioteca.ah";
    static final String CORREO_SAMY = "samy@biblioteca.ah";

    static final String ALIAS_ADMIN = "admin";
    static final String ALIAS_ANDERSON = "anderson";
    static final String ALIAS_SAMY = "samy";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.seed-data-enabled:true}")
    private boolean seedDataEnabled;

    @Value("${SEED_ADMIN_PASSWORD:}")
    private String adminPassword;

    @Value("${SEED_ANDERSON_PASSWORD:}")
    private String andersonPassword;

    @Value("${SEED_SAMY_PASSWORD:}")
    private String samyPassword;

    public LoadData(UserRepository userRepository, RoleRepository roleRepository,
                    PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (seedDataEnabled) {
            seedUsers();
        }
    }

    private void seedUsers() {
        /* Los dos roles los crea la migracion V1; si faltaran, la cuenta se
           crea sin el rol y se avisa: una cuenta sin rol se arregla desde la
           pantalla de administracion, un servicio que no arranca no. */
        Set<Role> deAdmin = rolesLlamados(SecurityUtils.ROL_ADMIN, SecurityUtils.ROL_USER);
        Set<Role> deUsuario = rolesLlamados(SecurityUtils.ROL_USER);

        int creadas = 0;
        creadas += crearSiFalta("Administrador", CORREO_ADMIN, ALIAS_ADMIN, adminPassword,
                "SEED_ADMIN_PASSWORD", deAdmin);
        creadas += crearSiFalta("Anderson", CORREO_ANDERSON, ALIAS_ANDERSON, andersonPassword,
                "SEED_ANDERSON_PASSWORD", deAdmin);
        creadas += crearSiFalta("Samy", CORREO_SAMY, ALIAS_SAMY, samyPassword,
                "SEED_SAMY_PASSWORD", deUsuario);
        log.info("Semilla de usuarios: {} cuenta(s) nueva(s)", creadas);
    }

    private int crearSiFalta(String nombre, String correo, String alias, String clave, String variable,
                             Set<Role> roles) {
        if (userRepository.findByEmail(correo).isPresent()) {
            return 0;
        }
        if (clave == null || clave.isBlank()) {
            log.warn("No se crea la cuenta {}: falta la variable de entorno {}", correo, variable);
            return 0;
        }
        userRepository.save(User.builder()
                .name(nombre)
                .email(correo)
                .alias(aliasLibre(alias))
                .password(passwordEncoder.encode(clave))
                .active(true)
                .roles(new HashSet<>(roles))
                .build());
        return 1;
    }

    /** El alias pedido o, si ya es de otra cuenta, el primer "alias-N" libre. */
    private String aliasLibre(String alias) {
        String candidato = alias;
        for (int n = 2; userRepository.existsByAlias(candidato); n++) {
            candidato = alias + "-" + n;
        }
        if (!candidato.equals(alias)) {
            log.warn("El alias {} ya lo tiene otra cuenta; la semilla usa {}", alias, candidato);
        }
        return candidato;
    }

    private Set<Role> rolesLlamados(String... nombres) {
        Set<Role> encontrados = new HashSet<>();
        for (String nombre : nombres) {
            roleRepository.findByNameAndActiveTrue(nombre).ifPresentOrElse(
                    encontrados::add,
                    () -> log.warn("La semilla no encontro el rol {}; las cuentas se crean sin el", nombre));
        }
        return encontrados;
    }
}
