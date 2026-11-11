import { AUTH_PREFIJO } from '@config'
import api from '@servicios/api'
import { AdminUser, LineaDeAuditoria, ModuloAdmin, PageDTO, PermisoDeRol, ResultDTO, Rol, UserFilter } from '@tipos'

const ADMIN_BASE = `${AUTH_PREFIJO}/admin`

/**
 * Administracion de la plataforma.
 *
 * Todo lo que hay aqui responde 403 si quien llama no lleva el rol ADMIN, y esa
 * comprobacion la hace el servidor. Esconder los botones en la app es cortesia
 * con el usuario, no seguridad: la seguridad es que estas rutas esten cerradas.
 */
export const adminService = {
  // ---- Usuarios ----
  usuarios: async (filter: UserFilter) => {
    const response = await api.post<ResultDTO<PageDTO<AdminUser>>>(`${ADMIN_BASE}/users/all`, filter)
    return response.data
  },

  usuario: async (id: number) => {
    const response = await api.post<ResultDTO<AdminUser>>(`${ADMIN_BASE}/users/get/${id}`)
    return response.data
  },

  crearUsuario: async (data: { name: string; email: string; password: string }) => {
    const response = await api.post<ResultDTO<AdminUser>>(`${ADMIN_BASE}/users/save`, data)
    return response.data
  },

  /** La lista COMPLETA de roles que tendra: no es anadir ni quitar. */
  fijarRoles: async (id: number, roles: string[]) => {
    const response = await api.post<ResultDTO<AdminUser>>(`${ADMIN_BASE}/users/${id}/roles`, {
      roles,
    })
    return response.data
  },

  cambiarActivacion: async (id: number, activar: boolean) => {
    const response = await api.post<ResultDTO<AdminUser>>(
      `${ADMIN_BASE}/users/${id}/${activar ? 'activate' : 'deactivate'}`,
    )
    return response.data
  },

  // ---- Roles ----
  roles: async () => {
    const response = await api.post<ResultDTO<Rol[]>>(`${ADMIN_BASE}/roles/all`)
    return response.data
  },

  guardarRol: async (data: { id?: number; name: string; description?: string; active?: boolean }) => {
    const response = await api.post<ResultDTO<Rol>>(`${ADMIN_BASE}/roles/save`, data)
    return response.data
  },

  desactivarRol: async (id: number) => {
    const response = await api.post<ResultDTO<Rol>>(`${ADMIN_BASE}/roles/delete/${id}`)
    return response.data
  },

  // ---- Modulos y permisos ----
  modulos: async () => {
    const response = await api.post<ResultDTO<ModuloAdmin[]>>(`${ADMIN_BASE}/modules/all`)
    return response.data
  },

  permisosDeRol: async (roleName: string) => {
    const response = await api.post<ResultDTO<PermisoDeRol[]>>(`${ADMIN_BASE}/permissions/${roleName}`)
    return response.data
  },

  guardarPermiso: async (data: {
    roleName: string
    pageId: number
    canRead: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
  }) => {
    const response = await api.post<ResultDTO<PermisoDeRol>>(`${ADMIN_BASE}/permissions/save`, data)
    return response.data
  },

  /**
   * El registro de quien hizo que. SOLO LECTURA: no hay metodo para escribir
   * ni para borrar, porque tampoco existe el endpoint. Un registro que se
   * puede retocar desde la aplicacion no prueba nada.
   */
  auditoria: async (filtro: {
    actorUserId?: number
    entityType?: string
    ultimosDias?: number
    page?: number
    size?: number
  }) => {
    const response = await api.post<ResultDTO<PageDTO<LineaDeAuditoria>>>(`${ADMIN_BASE}/audit/all`, filtro)
    return response.data
  },
}
