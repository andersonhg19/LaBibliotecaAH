import { textoQuedan } from '@componentes/lector/folio'

/*
 * DÓNDE VAS DENTRO DEL CAPÍTULO (petición de Anderson, iPhone): el indicador
 * del pie («Capítulo 7 · 45 % · quedan 6 min»), el capítulo marcado en el
 * índice y los botones ‹ capítulo anterior / capítulo siguiente ›. Funciones
 * puras: se prueban sin navegador.
 *
 * Un «capítulo» es una entrada del índice del EPUB con su sección. Va desde
 * donde empieza su sección hasta donde empieza el siguiente capítulo: las
 * secciones sin título (un capítulo partido en dos archivos) cuentan dentro
 * del anterior. Todo en fracciones del libro (0..1), las mismas de foliate.
 *
 * El taller parte los capítulos muy largos en trozos: «Capítulo 7», «Capítulo
 * 7 (parte 2 de 3)», «… (parte 3 de 3)». Para el indicador y ‹ › son UN
 * capítulo (el índice sigue enseñando los trozos).
 */

const SUFIJO_PARTE = /\s*\(parte \d+ de \d+\)\s*$/i

/** El título sin el «(parte k de n)» que pone el taller al partir un capítulo largo. */
export const tituloBase = (titulo: string): string => titulo.replace(SUFIJO_PARTE, '').trim()

export interface SeccionConTitulo {
  /** Dónde empieza en el libro (0..1). */
  fraccion: number
  titulo: string
  /** El destino del índice (para saltar a él). */
  href?: string
}

export interface TramoCapitulo {
  /** Posición en la lista de capítulos (0, 1, 2…). */
  indice: number
  titulo: string
  href: string | null
  inicio: number
  fin: number
}

/** Los capítulos del libro en orden, sin repetidos y cada uno con su final. */
export function tramosDeCapitulos(secciones: readonly SeccionConTitulo[]): TramoCapitulo[] {
  const orden = secciones
    .filter((s) => Number.isFinite(s.fraccion) && s.titulo?.trim())
    .slice()
    .sort((a, b) => a.fraccion - b.fraccion)
  const unicos: SeccionConTitulo[] = []
  for (const s of orden) {
    const prev = unicos[unicos.length - 1]
    // Dos secciones seguidas con el mismo título (o trozos «parte k de n») son el mismo capítulo.
    if (prev && (prev.titulo === tituloBase(s.titulo) || Math.abs(prev.fraccion - s.fraccion) < 1e-9)) continue
    unicos.push({ ...s, titulo: tituloBase(s.titulo) })
  }
  return unicos.map((s, i) => ({
    indice: i,
    titulo: s.titulo.trim(),
    href: s.href ?? null,
    inicio: Math.max(0, Math.min(1, s.fraccion)),
    fin: i + 1 < unicos.length ? Math.max(0, Math.min(1, unicos[i + 1].fraccion)) : 1,
  }))
}

export interface PosicionCapitulo {
  tramo: TramoCapitulo
  /** 0..1 dentro del capítulo. */
  avance: number
}

/** En qué capítulo cae una fracción del libro y cuánto llevas de él. */
export function capituloEn(fraccion: number, tramos: readonly TramoCapitulo[]): PosicionCapitulo | null {
  if (!tramos.length || !Number.isFinite(fraccion)) return null
  const f = Math.max(0, Math.min(1, fraccion))
  // Antes del primer capítulo (portada, dedicatoria): aún no hay capítulo.
  if (f + 1e-6 < tramos[0].inicio) return null
  let tramo = tramos[0]
  for (const t of tramos) if (t.inicio <= f + 1e-6) tramo = t
  const largo = tramo.fin - tramo.inicio
  const avance = largo > 0 ? Math.max(0, Math.min(1, (f - tramo.inicio) / largo)) : 0
  return { tramo, avance }
}

/**
 * Minutos que quedan del capítulo entero: lo que queda del trozo actual (lo
 * calcula el lector) más los trozos «(parte k de n)» que vienen detrás.
 */
export function minutosQuedanCapitulo(
  minutosTrozo: number | null,
  capitulo: number,
  capitulos: readonly { indice: number; titulo: string; minutos: number }[],
): number | null {
  if (minutosTrozo == null) return null
  const porIndice = new Map(capitulos.map((c) => [c.indice, c]))
  const actual = porIndice.get(capitulo)
  if (!actual) return minutosTrozo
  const base = tituloBase(actual.titulo)
  let total = minutosTrozo
  for (let i = capitulo + 1; ; i++) {
    const c = porIndice.get(i)
    if (!c || !SUFIJO_PARTE.test(c.titulo) || tituloBase(c.titulo) !== base) break
    total += Math.max(0, c.minutos || 0)
  }
  return total
}

/** El capítulo de antes y el de después (null en los extremos del libro). */
export function vecinos(
  tramos: readonly TramoCapitulo[],
  actual: TramoCapitulo | null,
): { anterior: TramoCapitulo | null; siguiente: TramoCapitulo | null } {
  if (!tramos.length) return { anterior: null, siguiente: null }
  // Antes del primer capítulo, «siguiente» lleva al primero.
  if (!actual) return { anterior: null, siguiente: tramos[0] }
  return {
    anterior: actual.indice > 0 ? (tramos[actual.indice - 1] ?? null) : null,
    siguiente: tramos[actual.indice + 1] ?? null,
  }
}

/** Porcentaje entero que se muestra (99 % hasta acabar de verdad: nunca «100 %» con texto por leer). */
export function porcentajeCapitulo(avance: number): number {
  if (!Number.isFinite(avance)) return 0
  const p = Math.round(Math.max(0, Math.min(1, avance)) * 100)
  return avance < 1 && p === 100 ? 99 : p
}

/** Lo que dice el indicador: «Capítulo 7 · 45 % · quedan 6 min». Sin capítulo, el avance del libro. */
export function textoIndicador(
  pos: PosicionCapitulo | null,
  minutos: number | null,
  fraccionLibro: number,
): { titulo: string; detalle: string } {
  if (!pos) return { titulo: 'Inicio del libro', detalle: `${porcentajeCapitulo(fraccionLibro)} % del libro` }
  const quedan = textoQuedan(minutos)
  return {
    titulo: pos.tramo.titulo,
    detalle: [`${porcentajeCapitulo(pos.avance)} %`, quedan].filter(Boolean).join(' · '),
  }
}

/** La frase para el lector de pantalla: «Capítulo 7, vas por el 45 %, quedan 6 min. Abrir el índice». */
export function etiquetaIndicador(pos: PosicionCapitulo | null, minutos: number | null, fraccionLibro: number): string {
  const quedan = textoQuedan(minutos)
  const lugar = pos
    ? `${pos.tramo.titulo}, vas por el ${porcentajeCapitulo(pos.avance)} % del capítulo`
    : `Inicio del libro, ${porcentajeCapitulo(fraccionLibro)} % del libro`
  return `${lugar}${quedan ? `, ${quedan}` : ''}. Abrir el índice`
}

/**
 * Qué entrada del índice es la de ahora: la del mismo destino (sin el #ancla)
 * o, si el índice no trae destinos, la del mismo título. -1 si ninguna.
 */
export function entradaActual(
  indice: readonly { titulo: string; href: string }[],
  actual: TramoCapitulo | null,
  etiqueta?: string | null,
): number {
  const sinAncla = (h: string | null | undefined) => (h ?? '').split('#')[0]
  // Lo que dice foliate primero: distingue el trozo («parte 2 de 3») en el que estás.
  const porEtiqueta = etiqueta ? indice.findIndex((i) => i.titulo === etiqueta) : -1
  if (porEtiqueta >= 0) return porEtiqueta
  if (actual?.href) {
    const exacta = indice.findIndex((i) => i.href && i.href === actual.href)
    if (exacta >= 0) return exacta
  }
  const porTitulo = actual ? indice.findIndex((i) => i.titulo === actual.titulo) : -1
  if (porTitulo >= 0) return porTitulo
  if (actual?.href) {
    const base = sinAncla(actual.href)
    return indice.findIndex((i) => i.href && sinAncla(i.href) === base)
  }
  return -1
}
