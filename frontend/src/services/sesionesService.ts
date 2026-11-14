import { API_URL, BIBLIOTECA_PREFIJO } from '@config'
import api, { tokenActual } from '@servicios/api'
import type { ResultDTO } from '@tipos'

/*
 * Sesiones de lectura y escucha (contrato C4, 0.4.0): el latido de cada minuto
 * mientras se lee o suena la voz, y el resumen para las estadísticas.
 */

export interface LatidoDTO {
  ejemplarId: string
  modo: 'LECTURA' | 'VOZ'
  /** Lo genera el cliente (uuid): el servidor crea la sesión o la alarga. */
  sesionId?: string
  capitulo: number
  /** Fracción del capítulo (0–1), como la manda también el lector. */
  posicion: number
  /** Segundos desde el latido anterior (0–120). */
  segundos: number
  dispositivo?: string
}

export interface LatidoRespuestaDTO {
  sesionId: string
  segundosTotales: number
}

export interface ResumenSesionesDTO {
  minutosLectura: number
  minutosVoz: number
  dias: { fecha: string; minutos: number }[]
  rachaActual: number
  rachaMaxima: number
  libros: { ejemplarId: string; minutos: number }[]
}

const B = BIBLIOTECA_PREFIJO

/**
 * El latido. Con `alSalir` (la pestaña se oculta o se cierra) va con fetch `keepalive` y la cabecera
 * Authorization, para que llegue aunque la página se descargue (sendBeacon no puede llevar el token: daría 401).
 */
export const enviarLatido = async (
  datos: LatidoDTO & { alSalir?: boolean },
): Promise<ResultDTO<LatidoRespuestaDTO>> => {
  const { alSalir, ...cuerpo } = datos
  const token = tokenActual()
  if (alSalir && typeof fetch === 'function' && token) {
    const r = await fetch(`${API_URL}${B}/sesiones/latido`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    })
    return (await r.json()) as ResultDTO<LatidoRespuestaDTO>
  }
  return (await api.post<ResultDTO<LatidoRespuestaDTO>>(`${B}/sesiones/latido`, cuerpo)).data
}

export const obtenerResumen = async (desde: string, hasta: string): Promise<ResultDTO<ResumenSesionesDTO>> =>
  (await api.get<ResultDTO<ResumenSesionesDTO>>(`${B}/sesiones/resumen`, { params: { desde, hasta } })).data
