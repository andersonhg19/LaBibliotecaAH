import AsyncStorage from '@react-native-async-storage/async-storage'
import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { API_URL, MODO_DEMO } from '@config'
import { adaptadorDemo } from '@servicios/mock/adaptador'
import { enEspanol } from '@utils/mensajes'

const TOKEN_KEY = '@biblioteca_ah_token'

const BASE_URL = API_URL

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/* Modo demostración: la API vive en memoria (services/mock). Las pantallas no
   se enteran: usan el mismo cliente, las mismas rutas y los mismos DTO. */
if (MODO_DEMO) {
  api.defaults.adapter = adaptadorDemo
}

/** El token en memoria, para construir las URL de binarios (`?t=`) sin esperar al almacenamiento. */
let tokenEnMemoria: string | null = null
export const fijarTokenEnMemoria = (t: string | null) => {
  tokenEnMemoria = t
}
export const tokenActual = () => tokenEnMemoria

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = tokenEnMemoria || (await AsyncStorage.getItem(TOKEN_KEY))
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // Sin token: el servidor dirá 401/403 y se cierra la sesión.
    }
    return config
  },
  (error) => Promise.reject(error),
)

/**
 * Qué hacer cuando el token caduca. Lo registra AuthContext al arrancar: la
 * sesión caduca en CUALQUIER petición, no en una pantalla concreta.
 */
export type MotivoDeCierre = 'EXPIRADA' | 'SIN_SESION'
type AlCaducarLaSesion = (motivo: MotivoDeCierre) => void
let alCaducarLaSesion: AlCaducarLaSesion | null = null

export const registrarCierreDeSesion = (fn: AlCaducarLaSesion | null) => {
  alCaducarLaSesion = fn
}

type ConfigConCabeceras =
  | { headers?: { get?: (k: string) => unknown; Authorization?: unknown; authorization?: unknown }; url?: string }
  | undefined

const llevabaToken = (config: ConfigConCabeceras): boolean => {
  const h = config?.headers
  if (!h) return false
  const v = typeof h.get === 'function' ? h.get('Authorization') : undefined
  return !!(v || h.Authorization || h.authorization)
}

/** Login y registro no tienen sesión que cerrar: su 401/403 es "datos malos". */
const esDeEntrada = (config: ConfigConCabeceras): boolean =>
  /\/auth\/(login|register)$/i.test(String(config?.url || '').split('?')[0])

api.interceptors.response.use(
  (response: AxiosResponse) => {
    const d = response?.data as { correct?: unknown; message?: unknown } | undefined
    if (d && typeof d === 'object' && d.correct === false && typeof d.message === 'string') {
      d.message = enEspanol(d.message)
    }
    return response
  },
  async (error) => {
    const status = error?.response?.status
    const config = error?.config
    if (alCaducarLaSesion && !esDeEntrada(config)) {
      try {
        if (status === 401) alCaducarLaSesion('EXPIRADA')
        else if (status === 403 && !llevabaToken(config)) alCaducarLaSesion('SIN_SESION')
      } catch (e) {
        console.error('[api] no se pudo cerrar la sesión caducada', e)
      }
    }
    return Promise.reject(error)
  },
)

export { TOKEN_KEY, BASE_URL }
export default api
