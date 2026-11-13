/*
 * LA NUMERACIÓN DEL ÍNDICE DE LA FICHA (QA UX-30). El taller cuenta como
 * «capítulo» todo lo que trae el libro, también la portadilla (la página con el
 * título) o los créditos del principio; el índice del lector (el TOC del EPUB)
 * empieza en «Capítulo 1». La ficha numeraba la portadilla como 01 y el
 * capítulo 1 como 02. Ahora lo preliminar del principio va sin número (con un
 * florón) y la cuenta empieza en el primer capítulo de verdad.
 */

// «Inicio» (solo, sin más) es como llama el taller al texto que va antes del primer capítulo (TXT, DOCX, PDF).
const PRELIMINAR =
  /^(portada|portadilla|cubierta|anteportada|cover|title\s*page|p[aá]gina\s+de\s+t[ií]tulo|cr[eé]ditos|copyright|derechos|legal|dedicatoria|epígrafe|ep[ií]grafe|[ií]ndice|contenido|tabla\s+de\s+contenidos?|contents|table\s+of\s+contents|inicio(?=\s*$))\b/i

/** Sin tildes, sin signos y en minúsculas: para comparar títulos. */
export const normalizarTitulo = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()

/** ¿Es una página preliminar (portadilla, créditos…) y no un capítulo? */
export function esPreliminar(tituloCapitulo: string, tituloLibro: string): boolean {
  const c = normalizarTitulo(tituloCapitulo)
  if (!c) return true
  if (c === normalizarTitulo(tituloLibro)) return true
  return PRELIMINAR.test(tituloCapitulo.trim())
}

/** «Sección 4»: el nombre que pone el taller a una página sin título (la portadilla, los créditos, una imagen). */
const SIN_TITULO = /^secci[oó]n\s+\d+$/i
/** Donde empieza el libro de verdad: «1 • …», «1. …», «Capítulo 1», «Capítulo uno», «I. …», «Chapter 1». */
const PRIMERO = /^\s*(?:(?:cap[ií]tulo|chapter)\s+(?:1|uno|one|i)\b|(?:1|uno|i)\s*(?:[.•·:\-–—)]|$))/i

interface CapituloNumerable {
  titulo: string
  /** Minutos a 1x; 0 = una página sin ninguna palabra (no se oye ni se numera). */
  minutos?: number
}

/**
 * El número que se enseña de cada capítulo (en el orden que vienen), o null si
 * es preliminar o una página vacía. Lo que va ANTES del primer capítulo de
 * verdad (sinopsis, portadilla, créditos, dedicatoria, una «Sección 4» sin
 * título) no se numera; un «Índice» al final sí. Si un capítulo dice ser el
 * primero («1 • Tengo un accidente…», «Capítulo 1»), la cuenta empieza ahí
 * (2026-11-12: «La diosa de tres cabezas» decía «Capítulo 4 de 46» en sus
 * créditos).
 */
export function numerarCapitulos(capitulos: CapituloNumerable[], tituloLibro: string): (number | null)[] {
  const vacio = (c: CapituloNumerable) => c.minutos === 0
  const limite = Math.max(12, Math.ceil(capitulos.length * 0.25))
  const ancla = capitulos.findIndex((c, i) => i < limite && !vacio(c) && PRIMERO.test(c.titulo))
  let n = 0
  let empezado = false
  const numeros = capitulos.map((c, i) => {
    if (vacio(c)) return null
    if (!empezado) {
      if (ancla > 0 && i < ancla) return null
      if (ancla < 0 && (esPreliminar(c.titulo, tituloLibro) || SIN_TITULO.test(c.titulo.trim()))) return null
    }
    empezado = true
    n += 1
    return n
  })
  // Un libro de un solo bloque (un TXT que se llama como el libro) se numera igual.
  return n === 0 ? capitulos.map((_, i) => i + 1) : numeros
}
