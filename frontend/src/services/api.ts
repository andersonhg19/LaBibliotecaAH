import AsyncStorage from '@react-native-async-storage/async-storage'
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { API_URL, AUTH_PREFIJO, MODO_DEMO } from '@config'
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

/*
 * V-NUEVO-2 (validación web 0.4.0): UN 401 SUELTO NO CIERRA LA SESIÓN.
 *
 * Se vieron 401 esporádicos con un token válido (el mismo endpoint daba 200
 * al momento) que echaban de la biblioteca a todos los dispositivos de la
 * cuenta. Ahora, antes de cerrar, se pregunta UNA vez a auth-service si la
 * sesión sigue viva (POST /auth/sesion, el mismo que usa biblioteca-service):
 *   · 401 → de verdad no vale (caducada, revocada, cuenta desactivada): se cierra;
 *   · 200 → vale: la petición se repite una vez (con el token más reciente) y,
 *     si aun así falla, se da el error a la pantalla SIN cerrar la sesión;
 *   · sin respuesta (sin red, auth caído) → no se cierra: ya se verá.
 * Varias peticiones que fallan a la vez comparten la misma pregunta.
 */
const RUTA_SESION = `${AUTH_PREFIJO}/auth/sesion`
/** Una respuesta de /auth/sesion vale para las peticiones que fallaron en este rato. */
const CONFIRMACION_VALE_MS = 3000
type Confirmacion = 'vigente' | 'revocada' | 'desconocida'
let confirmando: Promise<Confirmacion> | null = null

interface ConfigBah {
  /** Es la pregunta a /auth/sesion: su 401 no vuelve a preguntar. */
  _bahConfirmacion?: boolean
  /** Ya se repitió tras confirmar la sesión: no se repite otra vez. */
  _bahReintento?: boolean
}

const confirmarSesion = (): Promise<Confirmacion> => {
  if (!confirmando) {
    const config: ConfigBah & AxiosRequestConfig = { _bahConfirmacion: true }
    confirmando = api
      .post(RUTA_SESION, undefined, config)
      .then((): Confirmacion => 'vigente')
      .catch((e: unknown): Confirmacion =>
        (e as { response?: { status?: number } } | null)?.response?.status === 401 ? 'revocada' : 'desconocida',
      )
    const esta = confirmando
    esta.finally(() =>
      setTimeout(() => {
        if (confirmando === esta) confirmando = null
      }, CONFIRMACION_VALE_MS),
    )
  }
  return confirmando
}

/** Para las pruebas: olvida la última confirmación. */
export const olvidarConfirmacionDeSesion = () => {
  confirmando = null
}

const cerrarSesion = (motivo: MotivoDeCierre) => {
  try {
    alCaducarLaSesion?.(motivo)
  } catch (e) {
    console.error('[api] no se pudo cerrar la sesión caducada', e)
  }
}

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
    const config = error?.config as (InternalAxiosRequestConfig & ConfigBah) | undefined
    if (!alCaducarLaSesion || esDeEntrada(config) || config?._bahConfirmacion) return Promise.reject(error)
    if (status === 403 && !llevabaToken(config)) {
      cerrarSesion('SIN_SESION')
      return Promise.reject(error)
    }
    if (status !== 401) return Promise.reject(error)
    // Sin token no hay nada que confirmar: no hay sesión.
    if (!llevabaToken(config)) {
      cerrarSesion('EXPIRADA')
      return Promise.reject(error)
    }
    const confirmacion = await confirmarSesion()
    if (confirmacion === 'revocada') {
      cerrarSesion('EXPIRADA')
      return Promise.reject(error)
    }
    console.warn(`[api] 401 en ${String(config?.url ?? '')} con la sesión ${confirmacion}: no se cierra`)
    if (confirmacion === 'vigente' && config && !config._bahReintento) {
      // La petición no llegó a hacerse (el 401 lo da el filtro antes): repetirla es seguro.
      return api.request({ ...config, _bahReintento: true } as InternalAxiosRequestConfig)
    }
    return Promise.reject(Object.assign(error, { sesionVigente: confirmacion === 'vigente' }))
  },
)

export { TOKEN_KEY, BASE_URL }
export default api
