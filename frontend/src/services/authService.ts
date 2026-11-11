import { AUTH_PREFIJO } from '@config'
import api from '@servicios/api'
import { AuthResponse, LoginRequest, RegisterRequest, ResultDTO, ResultUserDTO } from '@tipos'

const AUTH_BASE = `${AUTH_PREFIJO}/auth`
const USERS_BASE = `${AUTH_PREFIJO}/users`

export const authService = {
  /** `usuario` es el correo o el alias: el servidor distingue por la @. */
  login: async (usuario: string, password: string) => {
    const cuerpo: LoginRequest = { usuario, password }
    const response = await api.post<ResultDTO<AuthResponse>>(`${AUTH_BASE}/login`, cuerpo)
    return response.data
  },

  register: async (data: RegisterRequest) => {
    const response = await api.post<ResultDTO<AuthResponse>>(`${AUTH_BASE}/register`, data)
    return response.data
  },

  /** Contrato v1.2: token nuevo de 24 h (misma respuesta que /login). Se llama al abrir y cada pocas horas. */
  renovar: async () => {
    const response = await api.post<ResultDTO<AuthResponse>>(`${AUTH_BASE}/renovar`)
    return response.data
  },

  getUser: async (id: string) => {
    const response = await api.post<ResultDTO<ResultUserDTO>>(`${USERS_BASE}/get/${id}`)
    return response.data
  },
}
