import { AUTH_PREFIJO } from '@config'
import api from '@servicios/api'
import { AuthResponse, LoginRequest, RegisterRequest, ResultDTO, ResultUserDTO } from '@tipos'

const AUTH_BASE = `${AUTH_PREFIJO}/auth`
const USERS_BASE = `${AUTH_PREFIJO}/users`

export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post<ResultDTO<AuthResponse>>(`${AUTH_BASE}/login`, { email, password } as LoginRequest)
    return response.data
  },

  register: async (data: RegisterRequest) => {
    const response = await api.post<ResultDTO<AuthResponse>>(`${AUTH_BASE}/register`, data)
    return response.data
  },

  getUser: async (id: string) => {
    const response = await api.post<ResultDTO<ResultUserDTO>>(`${USERS_BASE}/get/${id}`)
    return response.data
  },
}
