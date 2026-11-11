package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultMenuDTO;
import com.bibliotecaah.auth.entity.Module;
import com.bibliotecaah.auth.entity.Page;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.RolePermission;
import com.bibliotecaah.auth.repository.RolePermissionRepository;
import com.bibliotecaah.auth.service.impl.MenuServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("El menu: cada quien ve lo suyo")
class MenuServiceImplTest {

    @Mock private RolePermissionRepository permisos;
    @InjectMocks private MenuServiceImpl servicio;

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    private void entraCon(String... roles) {
        Collection<SimpleGrantedAuthority> autoridades = Arrays.stream(roles)
                .map(SimpleGrantedAuthority::new).collect(Collectors.toList());
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("quien@sea", null, autoridades);
        auth.setDetails(1L);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private static RolePermission permiso(String rol, String moduloCode, String paginaCode,
                                          boolean crear, boolean actualizar, boolean borrar) {
        Module modulo = Module.builder().id(1L).code(moduloCode).name(moduloCode)
                .icon("i").sortOrder(1).active(true).build();
        Page pagina = Page.builder().id(1L).module(modulo).code(paginaCode).name(paginaCode)
                .route("Ruta" + paginaCode).icon("i").inMenu(true).sortOrder(1).active(true).build();
        return RolePermission.builder()
                .id(1L)
                .role(Role.builder().id(1L).name(rol).active(true).build())
                .page(pagina)
                .canRead(true).canCreate(crear).canUpdate(actualizar).canDelete(borrar)
                .active(true).build();
    }

    private static ResultMenuDTO menu(ResultDTO resultado) {
        return (ResultMenuDTO) resultado.getObject();
    }

    @Test
    @DisplayName("devuelve los modulos y paginas del rol que trae el token")
    void devuelveLoSuyo() {
        entraCon("USER");
        when(permisos.findParaRoles(anyCollection()))
                .thenReturn(List.of(permiso("USER", "finanzas", "panel", true, true, true)));

        ResultMenuDTO resultado = menu(servicio.miMenu());

        assertThat(resultado.getModules()).hasSize(1);
        assertThat(resultado.getModules().get(0).getCode()).isEqualTo("finanzas");
        assertThat(resultado.getModules().get(0).getPages()).hasSize(1);
        assertThat(resultado.getModules().get(0).getPages().get(0).getRoute()).isEqualTo("Rutapanel");
    }

    @Test
    @DisplayName("sin roles, menu vacio y no un error: la app tiene que poder cargar")
    void sinRoles() {
        entraCon();

        ResultDTO resultado = servicio.miMenu();

        assertThat(resultado.isCorrect()).isTrue();
        assertThat(menu(resultado).getModules()).isEmpty();
        verify(permisos, never()).findParaRoles(anyCollection());
    }

    @Test
    @DisplayName("sin sesion tampoco revienta")
    void sinSesion() {
        SecurityContextHolder.clearContext();

        ResultDTO resultado = servicio.miMenu();

        assertThat(resultado.isCorrect()).isTrue();
        assertThat(menu(resultado).getModules()).isEmpty();
    }

    @Test
    @DisplayName("dos roles sobre la misma pagina la pintan UNA vez, y los permisos se suman")
    void dosRolesSumanSinDuplicar() {
        /* Quitar un rol nunca deberia quitar algo que otro rol tuyo tambien
           concede; y la pagina no puede salir dos veces en el menu. */
        entraCon("USER", "CONTABLE");
        when(permisos.findParaRoles(anyCollection())).thenReturn(List.of(
                permiso("USER", "finanzas", "panel", false, false, false),
                permiso("CONTABLE", "finanzas", "panel", true, false, true)));

        ResultMenuDTO resultado = menu(servicio.miMenu());

        assertThat(resultado.getModules()).hasSize(1);
        assertThat(resultado.getModules().get(0).getPages()).hasSize(1);
        ResultMenuDTO.PaginaDTO pagina = resultado.getModules().get(0).getPages().get(0);
        assertThat(pagina.getCanCreate()).isTrue();
        assertThat(pagina.getCanDelete()).isTrue();
        assertThat(pagina.getCanUpdate()).isFalse();
    }

    @Test
    @DisplayName("agrupa por modulo: dos paginas del mismo modulo van juntas")
    void agrupaPorModulo() {
        entraCon("USER");
        RolePermission panel = permiso("USER", "finanzas", "panel", true, true, true);
        RolePermission resumen = permiso("USER", "finanzas", "resumen", true, true, true);
        when(permisos.findParaRoles(anyCollection())).thenReturn(List.of(panel, resumen));

        ResultMenuDTO resultado = menu(servicio.miMenu());

        assertThat(resultado.getModules()).hasSize(1);
        assertThat(resultado.getModules().get(0).getPages()).hasSize(2);
    }

    @Test
    @DisplayName("el menu NO trae lo que la persona no puede ver")
    void noTraeLoAjeno() {
        /* Se comprueba a nivel de consulta: findParaRoles solo recibe los roles
           de quien pregunta. Mandar el catalogo entero con marcas de "puedes /
           no puedes" dejaria las pantallas de administracion viajando al
           telefono de cualquiera. */
        entraCon("USER");
        when(permisos.findParaRoles(anyCollection())).thenReturn(List.of());

        assertThat(menu(servicio.miMenu()).getModules()).isEmpty();
        verify(permisos).findParaRoles(argThat(roles ->
                roles.contains("USER") && !roles.contains("ADMIN")));
    }
}
