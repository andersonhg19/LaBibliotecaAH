/*
 * VELOCIDAD DE 0.5x A 5x (plan §6.3).
 *
 * El servidor genera dos archivos por capítulo: el normal (1x) y uno ya
 * acelerado al doble (2x). Por encima de 2.5x la corrección de tono del
 * navegador empieza a sonar a robot, así que:
 *
 *   · hasta 2.5x  → archivo 1x a esa velocidad (2.5x es lo más que se estira);
 *   · más de 2.5x → archivo 2x a la mitad (5x = archivo 2x a 2.5x).
 *
 * Toda la app piensa en "segundos del capítulo a 1x" (la línea de tiempo de
 * tiempos.json). El archivo 2x dura la mitad: su currentTime es pos1x / 2.
 */

export const PASOS_VELOCIDAD = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const
export const VELOCIDAD_MIN = 0.5
export const VELOCIDAD_MAX = 5
export const PASO_FINO = 0.05
/** Hasta aquí se usa el archivo 1x y se resalta palabra a palabra. */
export const UMBRAL_2X = 2.5

export type Variante = '1x' | '2x'

export interface PlanDeVelocidad {
  variante: Variante
  /** Cuánto más rápido es el archivo que el texto (1 o 2). */
  factor: 1 | 2
  /** El playbackRate que se pone en el <audio>. */
  rate: number
}

/** Redondea al paso fino y la deja dentro de 0.5..5. */
export function normalizarVelocidad(v: number): number {
  if (!Number.isFinite(v)) return 1
  const r = Math.round(v / PASO_FINO) * PASO_FINO
  return Math.min(VELOCIDAD_MAX, Math.max(VELOCIDAD_MIN, Number(r.toFixed(2))))
}

export function planDeVelocidad(velocidad: number): PlanDeVelocidad {
  const v = normalizarVelocidad(velocidad)
  if (v <= UMBRAL_2X) return { variante: '1x', factor: 1, rate: v }
  return { variante: '2x', factor: 2, rate: Number((v / 2).toFixed(3)) }
}

/** currentTime del archivo para una posición en la línea de tiempo 1x. */
export const tiempoEnArchivo = (pos1x: number, factor: 1 | 2) => pos1x / factor
/** Posición en la línea de tiempo 1x a partir del currentTime del archivo. */
export const tiempoEn1x = (currentTime: number, factor: 1 | 2) => currentTime * factor

/** Si a esta velocidad tiene sentido resaltar la palabra (a 3x ya nadie la sigue con la vista). */
export const resaltaPalabra = (velocidad: number) => normalizarVelocidad(velocidad) <= UMBRAL_2X

/** El paso siguiente o anterior de la escala, desde cualquier valor (aunque venga del deslizador fino). */
export function pasoVecino(velocidad: number, direccion: 1 | -1): number {
  const v = normalizarVelocidad(velocidad)
  if (direccion > 0) return PASOS_VELOCIDAD.find((p) => p > v + 1e-9) ?? VELOCIDAD_MAX
  return [...PASOS_VELOCIDAD].reverse().find((p) => p < v - 1e-9) ?? VELOCIDAD_MIN
}

export const textoVelocidad = (v: number) =>
  `${normalizarVelocidad(v)
    .toFixed(2)
    .replace(/\.?0+$/, '')}x`
