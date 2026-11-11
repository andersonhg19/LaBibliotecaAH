import { reloj } from '@logica/formato'
import { textoVelocidad } from '@logica/velocidad'
import type { CapituloResumen } from '@tipos'
import { EstadoVoz, TEXTOS_VOZ, textoEspera } from '@utils/motorAudio'

/*
 * Lo que el reproductor y el mini reproductor DICEN de la voz. Funciones puras
 * para que los dos digan lo mismo (y se puedan probar sin pantalla).
 */

/** Segundos reales que quedan del capítulo a la velocidad elegida, o null si aún no se sabe (UX-11). */
export function restanteCapitulo(posicion: number, duracion: number, velocidad: number): number | null {
  if (!(duracion > 0)) return null
  return Math.max(0, (duracion - Math.min(posicion, duracion)) / (velocidad || 1))
}

/** Segundos reales que quedan del libro: lo que falta de este capítulo y los minutos de los siguientes. */
export function restanteLibro(
  capitulos: CapituloResumen[],
  capitulo: number,
  posicion: number,
  duracion: number,
  velocidad: number,
): number | null {
  const siguientes = capitulos.filter((c) => c.indice > capitulo).reduce((a, c) => a + (c.minutos || 0) * 60, 0)
  const esteMin = capitulos.find((c) => c.indice === capitulo)?.minutos || 0
  const este = duracion > 0 ? Math.max(0, duracion - posicion) : esteMin * 60
  const total = este + siguientes
  return total > 0 ? total / (velocidad || 1) : null
}

/** «2 h 10 min», «35 min», «menos de 1 min». */
export function duracionHumana(segundos: number): string {
  const min = Math.round(segundos / 60)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h} h${m ? ` ${m} min` : ''}`
}

/** «quedan 8:40 a 1.5x» o «—:—» mientras no hay audio (antes decía «-0:00 a 1x»). */
export function textoRestante(v: Pick<EstadoVoz, 'posicion' | 'duracion' | 'velocidad'>): string {
  const r = restanteCapitulo(v.posicion, v.duracion, v.velocidad)
  return r == null ? '—:—' : `quedan ${reloj(r)} a ${textoVelocidad(v.velocidad)}`
}

export interface AvisoVoz {
  texto: string
  tono: 'info' | 'espera' | 'error'
  /** Si tiene sentido ofrecer «Reintentar». */
  reintentar: boolean
}

/** El aviso que toca ahora: preparando (con cuánto falta), cambio de voz, error o nada. */
export function avisoDeVoz(v: EstadoVoz, ahora: number): AvisoVoz | null {
  if (v.fase === 'error')
    return {
      texto: v.mensaje ?? TEXTOS_VOZ.capituloFallo,
      tono: 'error',
      reintentar: v.tipoError !== 'conversion',
    }
  if (v.fase === 'preparando' && v.mensaje)
    return { texto: textoEspera(v.mensaje, v.preparacion, ahora), tono: 'espera', reintentar: false }
  if (v.vozPendiente)
    return {
      texto: textoEspera(`${TEXTOS_VOZ.vozNueva(v.vozPendiente.nombre, v.nombreVoz)}…`, v.vozPendiente, ahora),
      tono: 'espera',
      reintentar: false,
    }
  if (v.mensaje) return { texto: v.mensaje, tono: 'info', reintentar: false }
  return null
}
