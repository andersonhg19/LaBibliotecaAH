/*
 * LA NUMERACIÓN DEL ÍNDICE DE LA FICHA (QA UX-30). El taller cuenta como
 * «capítulo» todo lo que trae el libro, también la portadilla (la página con el
 * título) o los créditos del principio; el índice del lector (el TOC del EPUB)
 * empieza en «Capítulo 1». La ficha numeraba la portadilla como 01 y el
 * capítulo 1 como 02. Ahora lo preliminar del principio va sin número (con un
 * florón) y la cuenta empieza en el primer capítulo de verdad.
 */

const PRELIMINAR =
  /^(portada|portadilla|cubierta|anteportada|cover|title\s*page|p[aá]gina\s+de\s+t[ií]tulo|cr[eé]ditos|copyright|derechos|legal|dedicatoria|epígrafe|ep[ií]grafe|[ií]ndice|contenido|tabla\s+de\s+contenidos?|contents|table\s+of\s+contents)\b/i

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

/**
 * El número que se enseña de cada capítulo (en el orden que vienen), o null si
 * es preliminar. Solo cuenta como preliminar lo que va ANTES del primer
 * capítulo de verdad: un «Índice» al final sí se numera.
 */
export function numerarCapitulos(capitulos: { titulo: string }[], tituloLibro: string): (number | null)[] {
  let n = 0
  let empezado = false
  const numeros = capitulos.map((c) => {
    if (!empezado && esPreliminar(c.titulo, tituloLibro)) return null
    empezado = true
    n += 1
    return n
  })
  // Un libro de un solo bloque (un TXT que se llama como el libro) se numera igual.
  return n === 0 ? capitulos.map((_, i) => i + 1) : numeros
}
