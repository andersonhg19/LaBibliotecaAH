import type { EjemplarDTO } from '@tipos'

/*
 * CÓMO SE VE CADA LIBRO EN EL ESTANTE.
 *
 * Un estante con todos los lomos iguales parece una hoja de cálculo. Aquí cada
 * libro tiene su grosor (según lo que dura: un libro de 12 horas es gordo) y su
 * altura y su color (derivados del título con un hash, así son SIEMPRE los
 * mismos para el mismo libro y no saltan al recargar).
 */

/** Hash FNV-1a de 32 bits: estable y barato. */
export function hash(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Cueros y telas de encuadernación (todos oscuros para que el dorado se lea encima). */
export const CUEROS = [
  '#6B1F2A', // burdeos
  '#2F4A3A', // cuero verde
  '#1F3550', // azul tinta
  '#4A2E1C', // nogal
  '#6A3219', // cedro tostado (más hondo: el dorado tiene que leerse a 4,5:1, UX-27)
  '#3B2A4A', // ciruela
  '#26302F', // pizarra
  '#5A4320', // ocre viejo
  '#4E1A1A', // granate
  '#22303F', // marino
] as const

/** Color del lomo: el de una colección si lo tiene; si no, uno de los cueros por hash del título. */
export function colorLomo(libro: Pick<EjemplarDTO, 'id' | 'titulo'>, colorFijo?: string | null): string {
  if (colorFijo && /^#[0-9a-f]{6}$/i.test(colorFijo)) return colorFijo
  return CUEROS[hash(`${libro.titulo}|${libro.id}`) % CUEROS.length]
}

/** El dorado del título del lomo (latón claro u oro viejo, alternando por libro). */
export function doradoLomo(libro: Pick<EjemplarDTO, 'id'>): string {
  return hash(libro.id) % 3 === 0 ? DORADOS[0] : DORADOS[1]
}

export interface DimensionesLomo {
  alto: number
  grosor: number
}

/** Los dos dorados del título del lomo: los dos se miden contra todos los cueros. */
export const DORADOS = ['#E8CF8A', '#D9B866'] as const

/*
 * Escala física (plan de diseño A): lomos de 176 a 232 px en el teléfono (el PC
 * los agranda con `escala`). El grosor mínimo es 40 px: con los 2 px de aire a
 * cada lado, cada lomo es un objetivo de 44 px (UX-06). Antes había lomos de 22.
 */
export const ALTO_MIN = 176
export const ALTO_MAX = 232
export const GROSOR_MIN = 40
export const GROSOR_MAX = 68
/** Aire a cada lado del lomo: es zona táctil, no se ve. */
export const AIRE_LOMO = 2

/**
 * Grosor según la duración: ~150 palabras/min y ~280 palabras/página → un libro
 * de 300 páginas (~9 h) queda en ~59 px. Sin dato, un grosor medio estable.
 * Altura entre 176 y 232 px, como los formatos reales de bolsillo a tapa dura.
 */
export function dimensionesLomo(
  libro: Pick<EjemplarDTO, 'id' | 'titulo' | 'minutosEstimados'>,
  escala = 1,
): DimensionesLomo {
  const h = hash(libro.id + libro.titulo)
  const alto = ALTO_MIN + (h % (ALTO_MAX - ALTO_MIN + 1))
  let grosor: number
  if (libro.minutosEstimados && libro.minutosEstimados > 0) {
    const paginas = (libro.minutosEstimados * 150) / 280
    grosor = GROSOR_MIN + Math.sqrt(paginas) * 1.1
  } else {
    grosor = 44 + ((h >> 8) % 12)
  }
  grosor = Math.max(GROSOR_MIN, Math.min(GROSOR_MAX, Math.round(grosor)))
  return { alto: Math.round(alto * escala), grosor: Math.round(grosor * escala) }
}

/** Cuántas bandas doradas lleva el lomo (adorno): 2 o 3, estable por libro. */
export const bandasLomo = (libro: Pick<EjemplarDTO, 'id'>) => 2 + (hash(libro.id) % 2)

/** Cuántos lomos caben, más o menos, en un ancho de balda (para decidir si sobra sitio). */
export const capacidadBalda = (ancho: number) => Math.max(3, Math.floor(ancho / (GROSOR_MIN + 14 + AIRE_LOMO * 2)))

/**
 * POSTURA DE CADA LIBRO cuando la balda no se llena (plan de diseño A): el
 * último, inclinado contra su vecino; si sobra mucho sitio, el primero tumbado
 * (un libro tumbado ocupa lo que cuatro de pie) y, con más libros y más sitio,
 * otro encima formando una pila. Así una balda a medias parece una balda de
 * verdad y no una fila de soldados. Con la balda llena, todos de pie.
 */
export type Postura = 'derecho' | 'tumbado' | 'inclinado'
export function posturas(n: number, capacidad: number): Postura[] {
  const p: Postura[] = Array.from({ length: n }, () => 'derecho')
  if (n >= 2 && n < capacidad) p[n - 1] = 'inclinado'
  if (n >= 3 && n <= capacidad - 4) p[0] = 'tumbado'
  if (n >= 5 && n <= capacidad - 5) p[1] = 'tumbado'
  return p
}
