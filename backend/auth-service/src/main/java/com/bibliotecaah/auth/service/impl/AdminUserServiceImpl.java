package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.AsignarRolesDTO;
import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultAdminUserDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.AdminUserService;
import com.bibliotecaah.auth.service.CambioAuditable;
import com.bibliotecaah.auth.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Lo que un administrador puede hacer con las cuentas de los demas.
 *
 * Vive aparte de UserServiceImpl —el autoservicio— y no dentro de el con un
 * "si eres admin, ademas...". La razon es que asi la frase que describe cada
 * clase se mantiene entera y comprobable: en UserServiceImpl, "esto es tuyo y
 * de nadie mas" sigue siendo cierto sin excepciones; aqui, "para entrar hace
 * falta el rol ADMIN" lo garantiza una sola regla del SecurityConfig sobre
 * /v1/admin. Mezclarlas obligaria a repetir la comprobacion del rol en cada
 * metodo, y el metodo numero once es donde se olvida.
 */
@Slf4j
@Service
@Transactional
public class AdminUserServiceImpl implements AdminUserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher eventos;

    public AdminUserServiceImpl(UserRepository userRepository,
                                RoleRepository roleRepository,
                                PasswordEncoder passwordEncoder,
                                ApplicationEventPublisher eventos) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.eventos = eventos;
    }

    /**
     * Deja anotado quien hizo esto.
     *
     * El evento se publica DENTRO de la transaccion y el que escucha espera al
     * commit, asi que solo se anota lo que de verdad se guardo. Los datos van
     * explicitos —no la entidad para que el otro lado la desmonte con
     * reflexion—: si falta uno, no compila.
     */
    private void anotar(AuditLog.Accion accion, Long entityId, String detalle) {
        eventos.publishEvent(new CambioAuditable(
                SecurityUtils.getAuthenticatedUserId(),
                SecurityUtils.getAuthenticatedEmail(),
                "User", entityId, accion, detalle));
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getAll(UserFilterDTO filter) {
        String nombre = vacioComoNulo(filter.getName());
        String correo = vacioComoNulo(filter.getEmail());
        Pageable pageable = PageRequest.of(filter.getPage(), filter.getSize(), Sort.by("name").ascending());

        Page<User> page = userRepository.findAllForAdmin(nombre, correo, filter.getActive(), pageable);

        /* Los roles de toda la pagina en una sola consulta; ver
           findAllByIdWithRoles. Pedirlos uno a uno seria el N+1 clasico. */
        List<Long> ids = page.getContent().stream().map(User::getId).toList();
        Map<Long, List<String>> rolesPorUsuario = ids.isEmpty()
                ? Map.of()
                : userRepository.findAllByIdWithRoles(ids).stream()
                    .collect(Collectors.toMap(User::getId, u -> nombresDeRol(u.getRoles())));

        List<ResultAdminUserDTO> list = page.getContent().stream()
                .map(u -> aDTO(u, rolesPorUsuario.getOrDefault(u.getId(), List.of())))
                .toList();

        Map<String, Object> response = new HashMap<>();
        response.put("page", page.getNumber());
        response.put("size", page.getSize());
        response.put("totalPage", page.getTotalPages());
        response.put("totalElements", page.getTotalElements());
        response.put("list", list);
        return new ResultDTO(response);
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getById(Long id) {
        Optional<User> user = userRepository.findByIdWithRoles(id);
        if (user.isEmpty()) {
            return new ResultDTO(false, Message.Msj.userNotFound.toString(), 103);
        }
        return new ResultDTO(aDTO(user.get(), nombresDeRol(user.get().getRoles())));
    }

    @Override
    public ResultDTO crear(UserSaveDTO dto) {
        if (dto.getPassword() == null || dto.getPassword().isBlank()) {
            return new ResultDTO(false, Message.Msj.passwordRequired.toString(), 101);
        }
        if (userRepository.existsByEmailAndActiveTrue(dto.getEmail())) {
            return new ResultDTO(false, Message.Msj.emailAlreadyInUse.toString(), 102);
        }

        Optional<Role> rolBase = roleRepository.findByNameAndActiveTrue(SecurityUtils.ROL_USER);

        User user = User.builder()
                .name(dto.getName())
                .email(dto.getEmail())
                .password(passwordEncoder.encode(dto.getPassword()))
                .active(true)
                /* Toda cuenta nace con USER. Una cuenta sin ningun rol puede
                   entrar —el token es valido— pero no le sirve de nada, y ese
                   estado a medias es peor que no poder entrar. */
                .roles(rolBase.map(r -> new HashSet<>(Set.of(r))).orElseGet(HashSet::new))
                .build();

        User saved = userRepository.save(user);
        log.info("Admin creo la cuenta {}", saved.getEmail());
        anotar(AuditLog.Accion.USER_CREATE, saved.getId(), "Alta de " + saved.getEmail());
        return new ResultDTO(aDTO(saved, nombresDeRol(saved.getRoles())));
    }

    @Override
    public ResultDTO asignarRoles(Long userId, AsignarRolesDTO dto) {
        Optional<User> encontrado = userRepository.findByIdWithRoles(userId);
        if (encontrado.isEmpty()) {
            return new ResultDTO(false, Message.Msj.userNotFound.toString(), 103);
        }
        User user = encontrado.get();

        Set<Role> nuevos = new HashSet<>();
        for (String nombre : dto.getRoles()) {
            Optional<Role> rol = roleRepository.findByNameAndActiveTrue(nombre);
            if (rol.isEmpty()) {
                return new ResultDTO(false, Message.Msj.roleNotFound.toString(), 104);
            }
            nuevos.add(rol.get());
        }

        boolean perdiaAdmin = user.tieneRol(SecurityUtils.ROL_ADMIN)
                && nuevos.stream().noneMatch(r -> SecurityUtils.ROL_ADMIN.equals(r.getName()));
        if (perdiaAdmin && esElUltimoAdmin(userId)) {
            return new ResultDTO(false, Message.Msj.lastAdminCannotLoseRole.toString(), 105);
        }

        List<String> antes = nombresDeRol(user.getRoles());
        user.setRoles(nuevos);
        userRepository.save(user);
        log.info("Roles de {} fijados a {}", user.getEmail(), dto.getRoles());
        /* De que a que: sin el "antes", la linea dice que alguien tiene
           ADMIN pero no si se lo acaban de dar. */
        anotar(AuditLog.Accion.ROLES_ASSIGNED, user.getId(),
                user.getEmail() + ": " + antes + " -> " + nombresDeRol(nuevos));
        return new ResultDTO(aDTO(user, nombresDeRol(nuevos)));
    }

    @Override
    public ResultDTO cambiarActivacion(Long userId, boolean activar) {
        Optional<User> encontrado = userRepository.findByIdWithRoles(userId);
        if (encontrado.isEmpty()) {
            return new ResultDTO(false, Message.Msj.userNotFound.toString(), 103);
        }
        User user = encontrado.get();

        /* Desactivarse a uno mismo es cerrarse la puerta desde fuera y dejar la
           llave dentro: la sesion sigue viva hasta que caduque el token, pero
           el siguiente login ya no entra. */
        if (!activar && SecurityUtils.esDelUsuario(userId)) {
            return new ResultDTO(false, Message.Msj.cannotDeactivateSelf.toString(), 106);
        }
        if (!activar && user.tieneRol(SecurityUtils.ROL_ADMIN) && esElUltimoAdmin(userId)) {
            return new ResultDTO(false, Message.Msj.lastAdminCannotLoseRole.toString(), 105);
        }

        user.setActive(activar);
        userRepository.save(user);
        log.info("Cuenta {} {}", user.getEmail(), activar ? "reactivada" : "desactivada");
        anotar(activar ? AuditLog.Accion.USER_ACTIVATE : AuditLog.Accion.USER_DEACTIVATE,
                user.getId(), user.getEmail());
        return new ResultDTO(aDTO(user, nombresDeRol(user.getRoles())));
    }

    /**
     * ¿Es este el ultimo administrador que queda en pie?
     *
     * Se cuenta ANTES de aplicar el cambio, asi que "queda uno y es este" es
     * exactamente la condicion que hay que impedir. Sin esto, la plataforma se
     * puede quedar sin ningun administrador con dos clics, y a partir de ahi
     * ya no hay forma de volver a crear uno desde la aplicacion: hay que
     * entrar a la base de datos a mano.
     */
    private boolean esElUltimoAdmin(Long userId) {
        User candidato = userRepository.findByIdWithRoles(userId).orElse(null);
        if (candidato == null || !candidato.tieneRol(SecurityUtils.ROL_ADMIN)) return false;
        return userRepository.contarActivosConRol(SecurityUtils.ROL_ADMIN) <= 1;
    }

    private static List<String> nombresDeRol(Set<Role> roles) {
        if (roles == null) return List.of();
        return roles.stream().map(Role::getName).sorted().toList();
    }

    private static String vacioComoNulo(String valor) {
        return (valor == null || valor.isBlank()) ? null : valor.trim();
    }

    private static ResultAdminUserDTO aDTO(User user, List<String> roles) {
        ResultAdminUserDTO dto = new ResultAdminUserDTO();
        dto.setId(user.getId());
        dto.setName(user.getName());
        dto.setEmail(user.getEmail());
        dto.setActive(user.getActive());
        dto.setRoles(roles);
        dto.setCreatedAt(user.getCreatedAt());
        dto.setUpdatedAt(user.getUpdatedAt());
        return dto;
    }
}
