import type { CapituloResumen, ProgresoDTO } from '@tipos'

/*
 * RETOMAR EXACTAMENTE DONDE LO DEJÉ (plan §7.4, R4).
 *
 * La memoria vive en el servidor. Al abrir un libro SIEMPRE se pregunta al
 * servidor primero; lo guardado en el teléfono es solo un respaldo por si se
 * cortó la conexión antes de subirlo.
 *
 * Reglas (como el "¿ir a la última página leída?" de los lectores de verdad):
 *   1. Si solo hay uno de los dos, ese.
 *   2. Si el servidor es más reciente, viene de OTRO dispositivo y la posición
 *      es distinta de la de este, se abre donde iba ESTE dispositivo y se
 *      pregunta: "Seguiste en Android hasta el cap. 7 — ¿ir allí?".
 *   3. Si el servidor es más reciente y es de este dispositivo (o la misma
 *      posición), se abre en la del servidor sin preguntar.
 *   4. Si lo local es más reciente (no se llegó a subir), se abre ahí y se
 *      sube: el servidor se queda con el `actualizadoEn` más reciente.
 */

export interface Reanudacion {
  /** Dónde abrir. null = al principio. */
  inicial: ProgresoDTO | null
  /** La posición de otro dispositivo que se ofrece ("¿ir allí?"), si la hay. */
  ofrecer: ProgresoDTO | null
  /** Si lo local va por delante del servidor y hay que subirlo. */
  subirLocal: boolean
}

const fecha = (p: ProgresoDTO | null | undefined) => {
  const t = p?.actualizadoEn ? Date.parse(p.actualizadoEn) : NaN
  return Number.isFinite(t) ? t : 0
}

/** Dos progresos señalan el mismo sitio del libro. */
export function mismaPosicion(a: ProgresoDTO, b: ProgresoDTO): boolean {
  if (a.fraseId && b.fraseId) return a.fraseId === b.fraseId
  if (a.cfi && b.cfi) return a.cfi === b.cfi
  if (a.modo === 'VOZ' && b.modo === 'VOZ' && a.posicionAudioSeg != null && b.posicionAudioSeg != null)
    return a.capitulo === b.capitulo && Math.abs(a.posicionAudioSeg - b.posicionAudioSeg) < 2
  return a.capitulo === b.capitulo && Math.abs((a.porcentaje ?? 0) - (b.porcentaje ?? 0)) < 0.5
}

export function decidirReanudacion(
  local: ProgresoDTO | null | undefined,
  servidor: ProgresoDTO | null | undefined,
  dispositivo: string,
): Reanudacion {
  if (!servidor && !local) return { inicial: null, ofrecer: null, subirLocal: false }
  if (!servidor) return { inicial: local!, ofrecer: null, subirLocal: true }
  if (!local) return { inicial: servidor, ofrecer: null, subirLocal: false }

  const fl = fecha(local)
  const fs = fecha(servidor)
  if (fl > fs) return { inicial: local, ofrecer: null, subirLocal: true }

  const deOtro = !!servidor.dispositivo && servidor.dispositivo !== dispositivo
  if (fs > fl && deOtro && !mismaPosicion(local, servidor)) {
    return { inicial: local, ofrecer: servidor, subirLocal: false }
  }
  return { inicial: servidor, ofrecer: null, subirLocal: false }
}

/** Cuál de dos progresos gana: el de `actualizadoEn` más reciente (empate: el primero). */
export const masReciente = (a: ProgresoDTO | null, b: ProgresoDTO | null): ProgresoDTO | null => {
  if (!a) return b
  if (!b) return a
  return fecha(b) > fecha(a) ? b : a
}

/** Un nombre corto y humano para este dispositivo (sale en "Seguiste en … hasta …"). */
export function nombreDispositivo(ua: string | undefined | null): string {
  const u = ua || ''
  if (/iPhone/i.test(u)) return 'iPhone'
  if (/iPad/i.test(u)) return 'iPad'
  if (/Android/i.test(u)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(u)) return 'Mac'
  if (/Windows/i.test(u)) return 'PC'
  if (/Linux/i.test(u)) return 'Linux'
  return 'otro dispositivo'
}

/** "el capítulo 7 «La tormenta» (42 %)" */
export function describirPosicion(p: ProgresoDTO, capitulos?: CapituloResumen[]): string {
  const cap = capitulos?.find((c) => c.indice === p.capitulo)
  const nombre = cap?.titulo ? ` «${cap.titulo}»` : ''
  const pct = Math.round(p.porcentaje ?? 0)
  return `el capítulo ${p.capitulo + 1}${nombre} (${pct} %)`
}
