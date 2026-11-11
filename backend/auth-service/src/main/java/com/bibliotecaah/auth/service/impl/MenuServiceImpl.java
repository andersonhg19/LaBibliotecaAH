package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultMenuDTO;
import com.bibliotecaah.auth.entity.Page;
import com.bibliotecaah.auth.entity.RolePermission;
import com.bibliotecaah.auth.repository.RolePermissionRepository;
import com.bibliotecaah.auth.service.MenuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
public class MenuServiceImpl implements MenuService {

    private final RolePermissionRepository permisos;

    public MenuServiceImpl(RolePermissionRepository permisos) {
        this.permisos = permisos;
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO miMenu() {
        Set<String> misRoles = rolesDelToken();

        /* Sin roles no hay menu, y se devuelve vacio en vez de un error: quien
           acaba de entrar con un token antiguo —de antes de que existieran los
           roles— tiene que poder ver la aplicacion cargar y entender que no
           tiene nada asignado, no una pantalla de fallo. */
        if (misRoles.isEmpty()) {
            return new ResultDTO(new ResultMenuDTO(new ArrayList<>()));
        }

        List<RolePermission> concedidos = permisos.findParaRoles(misRoles);

        /* Dos roles pueden dar permiso sobre la misma pagina; el menu la pinta
           UNA vez, y lo que puede hacer ahi es la SUMA de los dos. Quitar un
           rol nunca deberia quitar algo que otro rol tuyo tambien concede. */
        Map<String, ResultMenuDTO.ModuloDTO> porModulo = new LinkedHashMap<>();
        Map<String, ResultMenuDTO.PaginaDTO> porPagina = new LinkedHashMap<>();

        for (RolePermission permiso : concedidos) {
            Page pagina = permiso.getPage();
            var modulo = pagina.getModule();

            ResultMenuDTO.ModuloDTO moduloDTO = porModulo.computeIfAbsent(modulo.getCode(), code -> {
                ResultMenuDTO.ModuloDTO nuevo = new ResultMenuDTO.ModuloDTO();
                nuevo.setCode(modulo.getCode());
                nuevo.setName(modulo.getName());
                nuevo.setIcon(modulo.getIcon());
                nuevo.setSortOrder(modulo.getSortOrder());
                nuevo.setPages(new ArrayList<>());
                return nuevo;
            });

            String clave = modulo.getCode() + "/" + pagina.getCode();
            ResultMenuDTO.PaginaDTO existente = porPagina.get(clave);
            if (existente == null) {
                ResultMenuDTO.PaginaDTO paginaDTO = new ResultMenuDTO.PaginaDTO();
                paginaDTO.setCode(pagina.getCode());
                paginaDTO.setName(pagina.getName());
                paginaDTO.setRoute(pagina.getRoute());
                paginaDTO.setIcon(pagina.getIcon());
                paginaDTO.setInMenu(pagina.getInMenu());
                paginaDTO.setSortOrder(pagina.getSortOrder());
                paginaDTO.setCanRead(Boolean.TRUE.equals(permiso.getCanRead()));
                paginaDTO.setCanCreate(Boolean.TRUE.equals(permiso.getCanCreate()));
                paginaDTO.setCanUpdate(Boolean.TRUE.equals(permiso.getCanUpdate()));
                paginaDTO.setCanDelete(Boolean.TRUE.equals(permiso.getCanDelete()));
                porPagina.put(clave, paginaDTO);
                moduloDTO.getPages().add(paginaDTO);
            } else {
                existente.setCanCreate(existente.getCanCreate() || Boolean.TRUE.equals(permiso.getCanCreate()));
                existente.setCanUpdate(existente.getCanUpdate() || Boolean.TRUE.equals(permiso.getCanUpdate()));
                existente.setCanDelete(existente.getCanDelete() || Boolean.TRUE.equals(permiso.getCanDelete()));
            }
        }

        return new ResultDTO(new ResultMenuDTO(new ArrayList<>(porModulo.values())));
    }

    private static Set<String> rolesDelToken() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) return Set.of();
        Set<String> roles = new LinkedHashSet<>();
        for (GrantedAuthority autoridad : auth.getAuthorities()) {
            roles.add(autoridad.getAuthority());
        }
        return roles;
    }
}
