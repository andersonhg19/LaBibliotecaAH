import type { FraseTiempo } from '@tipos'

/*
 * QUÉ FRASE SUENA AHORA (contratos §3 y §6).
 *
 * tiempos.json trae las frases ordenadas por t0. Para saber cuál suena en el
 * segundo t se hace una búsqueda binaria: con capítulos de miles de frases y
 * 60 consultas por segundo (requestAnimationFrame), recorrer la lista entera
 * se notaría en un móvil.
 *
 * Regla de los huecos: entre el final de una frase y el inicio de la siguiente
 * (la pausa) sigue "sonando" la anterior — así el resaltado no parpadea.
 */

/** Índice de la frase que suena en t (línea de tiempo 1x), o -1 si aún no empieza la primera. */
export function buscarFrase(frases: readonly FraseTiempo[], t: number): number {
  let lo = 0
  let hi = frases.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (frases[mid].t0 <= t) {
      res = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return res
}

/**
 * Índice de la palabra que suena dentro de una frase, o -1.
 * Las palabras son [inicioChar, finChar, t0, t1] con tiempos del capítulo.
 * Fuera de cualquier palabra (en el espacio entre dos) devuelve -1: el
 * resaltado de palabra se apaga un instante, el de frase no.
 */
export function buscarPalabra(palabras: readonly [number, number, number, number][], t: number): number {
  let lo = 0
  let hi = palabras.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [, , t0, t1] = palabras[mid]
    if (t < t0) hi = mid - 1
    else if (t >= t1) lo = mid + 1
    else return mid
  }
  return -1
}

/** El índice de la frase por su id (c003-s00012), o -1. */
export function indiceDeFrase(frases: readonly FraseTiempo[], id: string): number {
  const n = numeroDeFrase(id)
  // Lo normal: el índice coincide con el número de frase. Si no, se busca.
  if (n >= 0 && n < frases.length && frases[n].id === id) return n
  return frases.findIndex((f) => f.id === id)
}

/** Dónde saltar al pedir "frase anterior": si ya pasó más de 1.5 s de esta, a su inicio; si no, a la anterior. */
export function inicioFraseAnterior(frases: readonly FraseTiempo[], t: number, margen = 1.5): number {
  const i = buscarFrase(frases, t)
  if (i < 0) return 0
  if (t - frases[i].t0 > margen) return frases[i].t0
  return frases[Math.max(0, i - 1)].t0
}

/** Inicio de la frase siguiente, o null si esta es la última. */
export function inicioFraseSiguiente(frases: readonly FraseTiempo[], t: number): number | null {
  const i = buscarFrase(frases, t)
  const sig = frases[i + 1]
  return sig ? sig.t0 : null
}

const RE_FRASE = /^c(\d{3,})-s(\d{5,})$/

export const esIdDeFrase = (id: string | null | undefined): id is string => !!id && RE_FRASE.test(id)

/** Capítulo de un id de frase (c003-s00012 → 3), o -1. */
export function capituloDeFrase(id: string | null | undefined): number {
  const m = id ? RE_FRASE.exec(id) : null
  return m ? Number(m[1]) : -1
}

/** Número de frase dentro del capítulo (c003-s00012 → 12), o -1. */
export function numeroDeFrase(id: string | null | undefined): number {
  const m = id ? RE_FRASE.exec(id) : null
  return m ? Number(m[2]) : -1
}

export const idDeFrase = (capitulo: number, frase: number) =>
  `c${String(capitulo).padStart(3, '0')}-s${String(frase).padStart(5, '0')}`
