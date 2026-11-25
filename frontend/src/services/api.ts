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
  /** (C12) Sale de la cola sin red: si vuelve a fallar no se encola otra vez. */
  _bahCola?: boolean
}

/*
 * COLA SIN RED (0.5.0, contrato C12). El progreso y los latidos que no llegan por
 * falta de red (modo avión, túnel) se guardan en el dispositivo y se mandan solos
 * al volver la red (evento `online`, al arrancar y en cuanto otra petición sale
 * bien), en orden y de uno en uno:
 *   · progreso: solo el ÚLTIMO de cada libro; si entre tanto se guardó otro más
 *     nuevo, el de la cola se tira (nunca se pisa un progreso con uno viejo);
 *   · latidos: todos (el servidor junta por `sesionId`); solo con fallo de red
 *     claro (un timeout pudo llegar al servidor y se contaría dos veces).
 * El diario lleva su propia cola (utils/diario). Un fallo de red NUNCA cierra la
 * sesión: solo un 401 confirmado por auth-service (V-NUEVO-2).
 */
export const CLAVE_COLA_SIN_RED = 'bah.cola-sin-red'
const COLA_SIN_RED_MAX = 200
const ESPERA_AL_VOLVER_MS = 3000

export interface PeticionEnCola {
  url: string
  /** El cuerpo JSON tal cual se mandó. */
  datos: string
  /** Progreso de un libro: solo vale el último de cada clave. */
  clave: string | null
  en: number
}

const RUTA_PROGRESO = /\/progreso\/save$/
const RUTA_LATIDO = /\/sesiones\/latido$/

let colaEnMemoria: PeticionEnCola[] | null = null

const almacenCola = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

/** Lo que espera en la cola sin red. */
export function colaSinRed(): PeticionEnCola[] {
  if (colaEnMemoria) return colaEnMemoria
  try {
    const g = almacenCola()?.getItem(CLAVE_COLA_SIN_RED)
    const l = g ? (JSON.parse(g) as unknown) : null
    colaEnMemoria = Array.isArray(l) ? l.filter((x) => x && typeof x.url === 'string') : []
  } catch {
    colaEnMemoria = []
  }
  return colaEnMemoria
}

const fijarCola = (l: PeticionEnCola[]) => {
  colaEnMemoria = l.slice(-COLA_SIN_RED_MAX)
  try {
    almacenCola()?.setItem(CLAVE_COLA_SIN_RED, JSON.stringify(colaEnMemoria))
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
}

/** Para las pruebas: vacía la cola. */
export const olvidarColaSinRed = () => fijarCola([])

const rutaDe = (config: { url?: string } | undefined) => String(config?.url ?? '').split('?')[0]

const cuerpoDe = (config: { data?: unknown } | undefined): string | null => {
  const d = config?.data
  if (d == null) return null
  return typeof d === 'string' ? d : JSON.stringify(d)
}

const claveProgreso = (datos: string | null): string | null => {
  try {
    const id = datos ? (JSON.parse(datos) as { ejemplarId?: unknown }).ejemplarId : null
    return typeof id === 'string' ? `progreso:${id}` : null
  } catch {
    return null
  }
}

function alFallarLaRed(error: unknown, config: (InternalAxiosRequestConfig & ConfigBah) | undefined) {
  try {
    if (!config || config._bahCola || axios.isCancel(error)) return
    if (String(config.method ?? '').toLowerCase() !== 'post') return
    const ruta = rutaDe(config)
    const datos = cuerpoDe(config)
    if (datos == null) return
    const codigo = (error as { code?: string } | null)?.code
    if (RUTA_PROGRESO.test(ruta)) {
      const clave = claveProgreso(datos)
      fijarCola([
        ...colaSinRed().filter((p) => !clave || p.clave !== clave),
        { url: ruta, datos, clave, en: Date.now() },
      ])
    } else if (RUTA_LATIDO.test(ruta) && codigo !== 'ECONNABORTED' && codigo !== 'ETIMEDOUT') {
      fijarCola([...colaSinRed(), { url: ruta, datos, clave: null, en: Date.now() }])
    }
  } catch {
    /* la cola nunca rompe una petición */
  }
}

function alResponder(config: (InternalAxiosRequestConfig & ConfigBah) | undefined) {
  try {
    if (!colaSinRed().length) return
    // Un progreso más nuevo ya llegó: el de la cola de ese libro sobra (y no debe pisarlo luego).
    if (config && !config._bahCola && RUTA_PROGRESO.test(rutaDe(config))) {
      const clave = claveProgreso(cuerpoDe(config))
      if (clave) fijarCola(colaSinRed().filter((p) => p.clave !== clave))
    }
    // Hay red: lo pendiente, ya.
    if (!config?._bahCola && colaSinRed().length) programarVaciado(0)
  } catch {
    /* nada */
  }
}

let vaciando: Promise<void> | null = null
let vaciadoProgramado: ReturnType<typeof setTimeout> | null = null

function programarVaciado(ms: number) {
  if (vaciadoProgramado || vaciando) return
  vaciadoProgramado = setTimeout(() => {
    vaciadoProgramado = null
    void vaciarColaSinRed()
  }, ms)
}

/** Manda lo que esperaba en la cola, en orden. Sin red se para y lo deja para la próxima. */
export function vaciarColaSinRed(): Promise<void> {
  if (vaciando) return vaciando
  vaciando = (async () => {
    try {
      for (;;) {
        const p = colaSinRed()[0]
        if (!p) break
        try {
          await api.request({
            method: 'post',
            url: p.url,
            data: p.datos,
            _bahCola: true,
          } as AxiosRequestConfig & ConfigBah)
        } catch (e) {
          // Sigue sin red: se deja todo para la próxima vez.
          if (!(e as { response?: unknown } | null)?.response) break
          // El servidor respondió con un error: reintentarlo daría lo mismo.
        }
        fijarCola(colaSinRed().filter((x) => x !== p))
      }
    } finally {
      vaciando = null
    }
  })()
  return vaciando
}

if (
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function' &&
  typeof document !== 'undefined' &&
  !(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.JEST_WORKER_ID
) {
  window.addEventListener('online', () => programarVaciado(ESPERA_AL_VOLVER_MS))
  if (colaSinRed().length) programarVaciado(5000)
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
    alResponder(response?.config as (InternalAxiosRequestConfig & ConfigBah) | undefined)
    return response
  },
  async (error) => {
    const status = error?.response?.status
    const config = error?.config as (InternalAxiosRequestConfig & ConfigBah) | undefined
    // C12: sin red no hay 401 que valga (nunca se cierra la sesión por esto); lo que no debe perderse, a la cola.
    if (!error?.response) {
      alFallarLaRed(error, config)
      return Promise.reject(error)
    }
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
