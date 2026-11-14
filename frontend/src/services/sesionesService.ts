import { API_URL, BIBLIOTECA_PREFIJO, MODO_DEMO } from '@config'
import api, { tokenActual } from '@servicios/api'
import type { LatidoDTO, LatidoRespuestaDTO, ResultDTO, ResumenSesionesDTO } from '@tipos'

/*
 * SESIONES DE LECTURA Y DE ESCUCHA (contrato C4, P-01 de la auditoría de
 * producto). El lector y la voz mandan un «latido» cada 60 s mientras se lee o
 * suena, y uno último al salir; el servidor junta los latidos de una sesión
 * (por `sesionId`, que genera el cliente) y saca los minutos por día y la
 * racha para las estadísticas.
 *
 * Nada de esto puede estorbar a la lectura: un latido que falla se queda en un
 * aviso de consola. Si el servidor todavía no tiene la ruta (una 0.3.3, 404 o
 * 405), se deja de insistir hasta recargar la página.
 *
 * FIRMAS COMPARTIDAS con la voz (rama web-voz): `enviarLatido(datos)` y
 * `obtenerResumen(desde, hasta)`. No cambiarlas sin avisar.
 */

const B = BIBLIOTECA_PREFIJO
const RUTA_LATIDO = `${B}/sesiones/latido`
/** Tope de segundos por latido (el servidor rechaza más de 120). */
export const MAX_SEGUNDOS_LATIDO = 120

let sinServidor = false
/** Para las pruebas: vuelve a intentar aunque el servidor no tuviera la ruta. */
export const reiniciarSesiones = () => {
  sinServidor = false
}

const noExisteLaRuta = (e: unknown): boolean => {
  const st = (e as { response?: { status?: number } } | null)?.response?.status
  return st === 404 || st === 405
}

/** Un identificador de sesión (uuid v4); `crypto.randomUUID` si está, si no uno hecho a mano. */
export const nuevaSesionId = (): string => {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    /* sin crypto: a mano */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Lo que se manda: los segundos acotados a 0..120 y enteros, la posición a 0..1. */
export const cuerpoLatido = (d: LatidoDTO): LatidoDTO => ({
  ejemplarId: d.ejemplarId,
  modo: d.modo,
  ...(d.sesionId ? { sesionId: d.sesionId } : {}),
  capitulo: Math.max(0, Math.floor(d.capitulo || 0)),
  posicion: Math.max(0, Math.min(1, Number.isFinite(d.posicion) ? d.posicion : 0)),
  segundos: Math.max(0, Math.min(MAX_SEGUNDOS_LATIDO, Math.round(d.segundos || 0))),
  ...(d.dispositivo ? { dispositivo: d.dispositivo.slice(0, 40) } : {}),
})

/**
 * Al cerrar la pestaña o pasar a segundo plano, axios no llega: se usa un
 * `fetch` con `keepalive` (sobrevive a la página y, a diferencia de
 * `sendBeacon`, puede llevar la cabecera Authorization). Si no hay fetch, se
 * prueba sendBeacon con el token en `?t=` como los binarios.
 */
function latidoAlSalir(cuerpo: LatidoDTO): void {
  const url = `${API_URL}${RUTA_LATIDO}`
  const token = tokenActual()
  const json = JSON.stringify(cuerpo)
  try {
    if (typeof fetch === 'function') {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: json,
      }).catch((e) => console.warn('[sesiones] latido al salir', e))
      return
    }
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav?.sendBeacon) {
      const conT = token ? `${url}?t=${encodeURIComponent(token)}` : url
      nav.sendBeacon(conT, new Blob([json], { type: 'application/json' }))
    }
  } catch (e) {
    console.warn('[sesiones] latido al salir', e)
  }
}

/**
 * Manda un latido. Con `alSalir` (pagehide, pestaña oculta) va por keepalive y
 * no espera respuesta. Devuelve la respuesta del servidor, o null si no se
 * pudo (nunca lanza).
 */
export async function enviarLatido(
  datos: LatidoDTO & { alSalir?: boolean },
): Promise<ResultDTO<LatidoRespuestaDTO> | null> {
  if (sinServidor) return null
  const { alSalir, ...resto } = datos
  const cuerpo = cuerpoLatido(resto)
  if (alSalir && !MODO_DEMO) {
    latidoAlSalir(cuerpo)
    return null
  }
  try {
    const r = await api.post<ResultDTO<LatidoRespuestaDTO>>(RUTA_LATIDO, cuerpo)
    return r.data
  } catch (e) {
    if (noExisteLaRuta(e)) sinServidor = true
    else console.warn('[sesiones] no se pudo mandar el latido', e)
    return null
  }
}

/** Fechas AAAA-MM-DD. */
export async function obtenerResumen(desde: string, hasta: string): Promise<ResultDTO<ResumenSesionesDTO>> {
  const r = await api.get<ResultDTO<ResumenSesionesDTO>>(`${B}/sesiones/resumen`, { params: { desde, hasta } })
  return r.data
}
