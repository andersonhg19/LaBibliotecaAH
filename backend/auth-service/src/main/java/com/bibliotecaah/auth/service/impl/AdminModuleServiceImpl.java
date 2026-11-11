package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.PermisoSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultModuleDTO;
import com.bibliotecaah.auth.dto.output.ResultPermisoDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.entity.Module;
import com.bibliotecaah.auth.entity.Page;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.RolePermission;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.repository.ModuleRepository;
import com.bibliotecaah.auth.repository.PageRepository;
import com.bibliotecaah.auth.repository.RolePermissionRepository;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.service.AdminModuleService;
import com.bibliotecaah.auth.service.CambioAuditable;
import com.bibliotecaah.auth.util.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@Transactional
public class AdminModuleServiceImpl implements AdminModuleService {

    private final ModuleRepository modulos;
    private final PageRepository paginas;
    private final RoleRepository roles;
    private final RolePermissionRepository permisos;
    private final ApplicationEventPublisher eventos;

    public AdminModuleServiceImpl(ModuleRepository modulos, PageRepository paginas,
                                  RoleRepository roles, RolePermissionRepository permisos,
                                  ApplicationEventPublisher eventos) {
        this.modulos = modulos;
        this.paginas = paginas;
        this.roles = roles;
        this.permisos = permisos;
        this.eventos = eventos;
    }

    /** Un cambio de permisos es de lo mas delicado que hay aqui: se anota. */
    private void anotarPermiso(Long pageId, String detalle) {
        eventos.publishEvent(new CambioAuditable(
                SecurityUtils.getAuthenticatedUserId(),
                SecurityUtils.getAuthenticatedEmail(),
                "RolePermission", pageId, AuditLog.Accion.PERMISSION_CHANGE, detalle));
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getModulos() {
        List<ResultModuleDTO> resultado = new ArrayList<>();
        for (Module modulo : modulos.findAll()) {
            ResultModuleDTO dto = new ResultModuleDTO();
            dto.setId(modulo.getId());
            dto.setCode(modulo.getCode());
            dto.setName(modulo.getName());
            dto.setIcon(modulo.getIcon());
            dto.setSortOrder(modulo.getSortOrder());
            dto.setActive(modulo.getActive());
            dto.setPages(paginas.findAllByModuleIdOrderBySortOrderAsc(modulo.getId()).stream()
                    .map(AdminModuleServiceImpl::aPaginaDTO)
                    .toList());
            resultado.add(dto);
        }
        resultado.sort((a, b) -> {
            int porOrden = Integer.compare(
                    a.getSortOrder() == null ? 0 : a.getSortOrder(),
                    b.getSortOrder() == null ? 0 : b.getSortOrder());
            return porOrden != 0 ? porOrden : a.getName().compareTo(b.getName());
        });
        return new ResultDTO(resultado);
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getPermisosDeRol(String roleName) {
        if (roles.findByName(roleName).isEmpty()) {
            return new ResultDTO(false, Message.Msj.roleNotFound.toString(), 104);
        }
        List<ResultPermisoDTO> resultado = permisos.findTodosDelRol(roleName).stream()
                .map(rp -> new ResultPermisoDTO(
                        rp.getPage().getId(),
                        rp.getPage().getModule().getCode(),
                        rp.getPage().getCode(),
                        rp.getPage().getName(),
                        rp.getCanRead(), rp.getCanCreate(), rp.getCanUpdate(), rp.getCanDelete()))
                .toList();
        return new ResultDTO(resultado);
    }

    @Override
    public ResultDTO guardarPermiso(PermisoSaveDTO dto) {
        Optional<Role> rol = roles.findByName(dto.getRoleName());
        if (rol.isEmpty()) {
            return new ResultDTO(false, Message.Msj.roleNotFound.toString(), 104);
        }
        Optional<Page> pagina = paginas.findById(dto.getPageId());
        if (pagina.isEmpty()) {
            return new ResultDTO(false, Message.Msj.pageNotFound.toString(), 110);
        }

        /* ADMIN no se queda sin la administracion. Si se le pudiera quitar el
           permiso sobre su propio modulo, la pantalla desde la que se quita
           dejaria de existir para todo el mundo — incluido quien acaba de
           pulsar el boton. */
        boolean esAdminSobreSuModulo = SecurityUtils.ROL_ADMIN.equals(dto.getRoleName())
                && "administracion".equals(pagina.get().getModule().getCode());
        if (esAdminSobreSuModulo && !Boolean.TRUE.equals(dto.getCanRead())) {
            return new ResultDTO(false, Message.Msj.adminKeepsAdminModule.toString(), 111);
        }

        boolean sinNada = !Boolean.TRUE.equals(dto.getCanRead())
                && !Boolean.TRUE.equals(dto.getCanCreate())
                && !Boolean.TRUE.equals(dto.getCanUpdate())
                && !Boolean.TRUE.equals(dto.getCanDelete());

        Optional<RolePermission> existente =
                permisos.findByRoleIdAndPageId(rol.get().getId(), dto.getPageId());

        /* Quitarlo todo se guarda BORRANDO la fila, no dejandola con los cuatro
           campos en falso. En este modelo "no existir es no poder", asi que las
           dos formas significan lo mismo; tener las dos significaria tener dos
           maneras de decir lo mismo y una consulta que se olvida de una. */
        if (sinNada) {
            existente.ifPresent(permisos::delete);
            log.info("Permiso retirado: {} sobre {}", dto.getRoleName(), pagina.get().getCode());
            anotarPermiso(dto.getPageId(),
                    dto.getRoleName() + " pierde todo sobre " + pagina.get().getCode());
            return new ResultDTO(true, "OK", 0);
        }

        RolePermission permiso = existente.orElseGet(() -> RolePermission.builder()
                .role(rol.get())
                .page(pagina.get())
                .build());
        permiso.setCanRead(dto.getCanRead());
        permiso.setCanCreate(dto.getCanCreate());
        permiso.setCanUpdate(dto.getCanUpdate());
        permiso.setCanDelete(dto.getCanDelete());
        permiso.setActive(true);
        permisos.save(permiso);

        log.info("Permiso guardado: {} sobre {}", dto.getRoleName(), pagina.get().getCode());
        anotarPermiso(dto.getPageId(), dto.getRoleName() + " sobre " + pagina.get().getCode()
                + ": ver=" + dto.getCanRead() + " crear=" + dto.getCanCreate()
                + " editar=" + dto.getCanUpdate() + " borrar=" + dto.getCanDelete());
        return new ResultDTO(new ResultPermisoDTO(
                pagina.get().getId(),
                pagina.get().getModule().getCode(),
                pagina.get().getCode(),
                pagina.get().getName(),
                permiso.getCanRead(), permiso.getCanCreate(),
                permiso.getCanUpdate(), permiso.getCanDelete()));
    }

    private static ResultModuleDTO.ResultPageDTO aPaginaDTO(Page pagina) {
        return new ResultModuleDTO.ResultPageDTO(
                pagina.getId(), pagina.getCode(), pagina.getName(), pagina.getRoute(),
                pagina.getIcon(), pagina.getInMenu(), pagina.getSortOrder(), pagina.getActive());
    }
}
