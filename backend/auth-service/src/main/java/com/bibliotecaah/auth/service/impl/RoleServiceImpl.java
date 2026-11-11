package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.RoleSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultRoleDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.CambioAuditable;
import com.bibliotecaah.auth.service.RoleService;
import com.bibliotecaah.auth.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@Transactional
public class RoleServiceImpl implements RoleService {

    /**
     * Los dos roles que la plataforma da por supuestos: uno esta escrito en el
     * SecurityConfig de los tres servicios y el otro es el que recibe toda
     * cuenta nueva. No se renombran ni se desactivan desde la pantalla, porque
     * hacerlo dejaria reglas de seguridad apuntando a un rol que ya no existe
     * —y una regla que no coincide con nadie no falla: se salta.
     */
    private static final Set<String> ROLES_DEL_SISTEMA =
            Set.of(SecurityUtils.ROL_ADMIN, SecurityUtils.ROL_USER);

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventos;

    public RoleServiceImpl(RoleRepository roleRepository, UserRepository userRepository,
                           ApplicationEventPublisher eventos) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.eventos = eventos;
    }

    /** Quien toco los roles queda anotado; ver AuditoriaListener. */
    private void anotar(AuditLog.Accion accion, Long entityId, String detalle) {
        eventos.publishEvent(new CambioAuditable(
                SecurityUtils.getAuthenticatedUserId(),
                SecurityUtils.getAuthenticatedEmail(),
                "Role", entityId, accion, detalle));
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getAll() {
        List<ResultRoleDTO> roles = roleRepository.findAll().stream()
                .sorted((a, b) -> a.getName().compareTo(b.getName()))
                .map(r -> new ResultRoleDTO(
                        r.getId(), r.getName(), r.getDescription(), r.getActive(),
                        userRepository.contarActivosConRolId(r.getId())))
                .toList();
        return new ResultDTO(roles);
    }

    @Override
    public ResultDTO saveAndUpdate(RoleSaveDTO dto) {
        String nombre = dto.getName().trim();

        if (dto.getId() == null) {
            if (roleRepository.existsByName(nombre)) {
                return new ResultDTO(false, Message.Msj.roleAlreadyExists.toString(), 107);
            }
            Role nuevo = Role.builder()
                    .name(nombre)
                    .description(dto.getDescription())
                    .active(dto.getActive() == null || dto.getActive())
                    .build();
            Role guardado = roleRepository.save(nuevo);
            log.info("Rol creado: {}", guardado.getName());
            anotar(AuditLog.Accion.ROLE_CREATE, guardado.getId(), guardado.getName());
            return new ResultDTO(aDTO(guardado));
        }

        Optional<Role> encontrado = roleRepository.findById(dto.getId());
        if (encontrado.isEmpty()) {
            return new ResultDTO(false, Message.Msj.roleNotFound.toString(), 104);
        }
        Role rol = encontrado.get();
        String nombreAnterior = rol.getName();

        boolean esDelSistema = ROLES_DEL_SISTEMA.contains(rol.getName());
        if (esDelSistema && !rol.getName().equals(nombre)) {
            return new ResultDTO(false, Message.Msj.systemRoleCannotChange.toString(), 108);
        }
        if (!rol.getName().equals(nombre) && roleRepository.existsByName(nombre)) {
            return new ResultDTO(false, Message.Msj.roleAlreadyExists.toString(), 107);
        }
        if (esDelSistema && dto.getActive() != null && !dto.getActive()) {
            return new ResultDTO(false, Message.Msj.systemRoleCannotChange.toString(), 108);
        }

        rol.setName(nombre);
        rol.setDescription(dto.getDescription());
        if (dto.getActive() != null) {
            rol.setActive(dto.getActive());
        }
        roleRepository.save(rol);
        log.info("Rol actualizado: {}", rol.getName());
        anotar(AuditLog.Accion.ROLE_UPDATE, rol.getId(),
                nombreAnterior.equals(rol.getName())
                        ? rol.getName()
                        : nombreAnterior + " -> " + rol.getName());
        return new ResultDTO(aDTO(rol));
    }

    /**
     * Retirar un rol es desactivarlo, nunca borrarlo.
     *
     * Borrarlo dejaria sin explicacion las lineas de auditoria que lo nombran,
     * y ademas la clave ajena lo impide si alguien lo tiene puesto —que es la
     * proteccion correcta, pero se manifestaria como un error de base de datos
     * en la cara del usuario en vez de como un mensaje.
     */
    @Override
    public ResultDTO desactivar(Long id) {
        Optional<Role> encontrado = roleRepository.findById(id);
        if (encontrado.isEmpty()) {
            return new ResultDTO(false, Message.Msj.roleNotFound.toString(), 104);
        }
        Role rol = encontrado.get();

        if (ROLES_DEL_SISTEMA.contains(rol.getName())) {
            return new ResultDTO(false, Message.Msj.systemRoleCannotChange.toString(), 108);
        }
        long enUso = userRepository.contarActivosConRolId(id);
        if (enUso > 0) {
            return new ResultDTO(false, Message.Msj.roleInUse.toString(), 109);
        }

        rol.setActive(false);
        roleRepository.save(rol);
        log.info("Rol desactivado: {}", rol.getName());
        anotar(AuditLog.Accion.ROLE_DEACTIVATE, rol.getId(), rol.getName());
        return new ResultDTO(aDTO(rol));
    }

    private ResultRoleDTO aDTO(Role rol) {
        return new ResultRoleDTO(rol.getId(), rol.getName(), rol.getDescription(), rol.getActive(),
                userRepository.contarActivosConRolId(rol.getId()));
    }
}
