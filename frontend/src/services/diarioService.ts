import { API_URL, BIBLIOTECA_PREFIJO, MODO_DEMO } from '@config'
import api, { tokenActual } from '@servicios/api'
import type { EventoDiario, ResultadoEnvio } from '@utils/diario'

/*
 * EL DIARIO DEL REPRODUCTOR (0.5.0, contrato C9): `POST /v1/diario` con 1..50 eventos.
 * La cola, los lotes y cuándo se manda viven en utils/diario; aquí solo el envío.
 * Nunca lanza: devuelve qué hacer con el lote.
 */

export const RUTA_DIARIO = `${BIBLIOTECA_PREFIJO}/diario`

const estadoDe = (e: unknown): number | undefined => (e as { response?: { status?: number } } | null)?.response?.status

/** Qué hacer con un lote según la respuesta (o el fallo) del servidor. */
export function resultadoDe(status: number | undefined): ResultadoEnvio {
  if (status == null) return 'reintentar' // sin red
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404 || status === 405) return 'sin-ruta' // servidor sin diario (0.4.0)
  if (status === 400 || status === 413 || status === 422) return 'descartar'
  return 'reintentar' // 401/403 (sesión), 429, 5xx
}

/** Manda un lote por axios (con el token y el tratamiento de 401 de siempre). */
export async function enviarDiario(eventos: EventoDiario[]): Promise<ResultadoEnvio> {
  if (MODO_DEMO || !eventos.length) return 'ok'
  try {
    const r = await api.post(RUTA_DIARIO, { eventos })
    return resultadoDe(r.status)
  } catch (e) {
    return resultadoDe(estadoDe(e))
  }
}

/**
 * Al ocultarse la página: `fetch` con `keepalive` (sobrevive a la página y, a diferencia de `sendBeacon`, lleva la
 * cabecera Authorization). Resuelve true si el servidor lo guardó (o lo rechazó sin remedio).
 */
export async function enviarDiarioAlSalir(eventos: EventoDiario[]): Promise<boolean> {
  if (MODO_DEMO || !eventos.length) return true
  if (typeof fetch !== 'function') return false
  const token = tokenActual()
  try {
    const r = await fetch(`${API_URL}${RUTA_DIARIO}`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ eventos }),
    })
    return resultadoDe(r.status) !== 'reintentar'
  } catch {
    return false
  }
}
