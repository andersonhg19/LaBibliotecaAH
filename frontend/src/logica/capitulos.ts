/*
 * LA NUMERACIÓN DEL ÍNDICE DE LA FICHA (QA UX-30). El taller cuenta como
 * «capítulo» todo lo que trae el libro, también la portadilla (la página con el
 * título) o los créditos del principio; el índice del lector (el TOC del EPUB)
 * empieza en «Capítulo 1». La ficha numeraba la portadilla como 01 y el
 * capítulo 1 como 02. Ahora lo preliminar del principio va sin número (con un
 * florón) y la cuenta empieza en el primer capítulo de verdad.
 *
 * 0.4.0 (contrato C1/C3): los libros convertidos o reclasificados por el taller
 * traen en cada capítulo su `numero`, su `region` (antes · cuerpo · después) y
 * su `tipo`. Si llegan, se usan tal cual: el taller lee `epub:type`, los
 * landmarks y el `linear` del libro y sabe más que cualquier título. Lo de
 * abajo (los títulos) queda como RESPALDO para los libros v1 sin reclasificar
 * (casos C12), con los arreglos de la auditoría de conversión CF-02, CF-04,
 * CF-05, CF-06 y CF-17.
 */

export type RegionCapitulo = 'antes' | 'cuerpo' | 'despues'

// «Inicio» (solo, sin más) es como llama el taller al texto que va antes del primer capítulo (TXT, DOCX, PDF).
const PRELIMINAR =
  /^(portada|portadilla|cubierta|anteportada|cover|title\s*page|p[aá]gina\s+de\s+t[ií]tulo|cr[eé]ditos|copyright|derechos|legal|dedicatoria|epígrafe|ep[ií]grafe|[ií]ndice|contenido|tabla\s+de\s+contenidos?|contents|table\s+of\s+contents|inicio(?=\s*$))\b/i

/*
 * Lo que solo es preliminar si va ANTES del primer capítulo (CF-02): un
 * «Prólogo» al principio no es el capítulo 01. En mitad del libro sí cuenta.
 */
const PRELIMINAR_SI_VA_DELANTE =
  /^(pr[oó]logo|prefacio|introducci[oó]n|nota\s+(?:del|de\s+la)\s+(?:autor|autora|traductor|traductora|editor|editora|edici[oó]n)|sinopsis|cronolog[ií]a|mapas?|personajes|dramatis\s+personae|foreword|preface|prologue|introduction|synopsis|author'?s\s+note)\b/i

/*
 * Lo que va al final y no es un capítulo (CF-01, respaldo): solo cuenta como
 * «al final» si DETRÁS de ello tampoco hay capítulos (un bloque al cierre).
 */
const FINAL =
  /^(agradecimientos?|sobre\s+(?:el|la)\s+(?:autor|autora)|acerca\s+(?:del|de\s+la)\s+(?:autor|autora)|notas?(?:\s+finales)?|ap[eé]ndices?|anexos?|glosario|bibliograf[ií]a|colof[oó]n|otros\s+t[ií]tulos|otras\s+obras|del\s+mismo\s+autor|de\s+la\s+misma\s+autora|cr[eé]ditos|acknowledge?ments?|about\s+the\s+author|also\s+by|notes|appendix|glossary|bibliography|colophon)\b/i

/*
 * Una parte del libro (CF-05): «Primera parte», «Parte II», «Libro tercero»,
 * «Part One». No consume número: es la cabecera de un grupo de capítulos.
 */
const PARTE =
  /^\s*(?:(?:primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|novena|d[eé]cima|[uú]ltima)\s+parte\b|(?:parte|libro|part|book)\s+(?:[ivxlc]+|\d+|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|uno|dos|tres|cuatro|cinco|one|two|three|four|five|first|second|third)\b)/i

/** El sufijo que pone el taller al partir un capítulo largo (igual que en components/lector/capitulos). */
const SUFIJO_TROZO = /\s*\(parte \d+ de \d+\)\s*$/i

/** El título sin el «(parte k de n)» que pone el taller al partir un capítulo largo. */
export const sinTrozo = (titulo: string): string => titulo.replace(SUFIJO_TROZO, '').trim()

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

/** ¿Es la cabecera de una parte («Primera parte», «Parte II»)? */
export const esParte = (titulo: string): boolean => PARTE.test(sinTrozo(titulo))

/** «Sección 4»: el nombre que pone el taller a una página sin título (la portadilla, los créditos, una imagen). */
const SIN_TITULO = /^secci[oó]n\s+\d+$/i
/*
 * Donde empieza el libro de verdad: «1 • …», «1. …», «Capítulo 1», «Capítulo uno», «I. …», «Chapter 1»,
 * y también (CF-02) «Capítulo primero», «CAPÍTULO 01», «Chapter 01», «Chapter One», «Chapter First», «Cap. 1».
 */
const PRIMERO =
  /^\s*(?:(?:cap[ií]tulo|chapter|cap\.)\s*(?:0*1|uno|una|one|first|primer[oa]?|i)\b|(?:0*1|uno|i)\s*(?:[.•·:\-–—)]|$))/i

/** Un ancla solo vale si antes de ella hay como mucho esto de «cuerpo» (CF-04: un adelanto al final). */
const MAX_CUERPO_ANTES_DEL_ANCLA = 3
const MAX_FRACCION_ANTES_DEL_ANCLA = 0.15
/** Una sección que se llama como el libro pero dura más que esto es texto, no una portadilla (CF-06). */
const MINUTOS_NO_PORTADILLA = 20

interface CapituloNumerable {
  titulo: string
  /** Minutos a 1x; 0 = una página sin ninguna palabra (no se oye ni se numera). */
  minutos?: number
  /** v2 (C3): el número que calculó el taller; null = sin número. Ausente = libro v1. */
  numero?: number | null
  /** v2 (C3): dónde va en el libro. */
  region?: RegionCapitulo | null
  /** v2 (C3): qué es («capitulo», «parte», «prologo»…). */
  tipo?: string | null
}

export interface LugarEnIndice {
  /** El número que se enseña, o null (preliminar, parte, final, página vacía). */
  numero: number | null
  region: RegionCapitulo
  /** La cabecera de una parte: se pinta como título de grupo, no como fila. */
  parte: boolean
}

/**
 * ¿Trae el libro la estructura del taller (C1 v2)? Se decide por la REGIÓN: un
 * v2 la trae siempre; un v1 la trae a null (o no la trae). No por `numero`: la
 * API manda `"numero": null` también en los v1, y así nunca se usaba el respaldo
 * (C12: el índice salía sin números ni grupos hasta reclasificar).
 */
export const tieneEstructura = (capitulos: readonly CapituloNumerable[]): boolean =>
  capitulos.length > 0 && capitulos.every((c) => c.region != null)

/**
 * Dónde va cada capítulo del índice (en el orden que vienen): su número, su
 * región y si es la cabecera de una parte. Con estructura v2 se toma de la API;
 * si no, se deduce de los títulos (respaldo v1).
 */
export function estructurarIndice(capitulos: readonly CapituloNumerable[], tituloLibro: string): LugarEnIndice[] {
  if (tieneEstructura(capitulos)) {
    return capitulos.map((c) => ({
      numero: typeof c.numero === 'number' ? c.numero : null,
      region: c.region === 'antes' || c.region === 'despues' ? c.region : 'cuerpo',
      parte: c.tipo === 'parte',
    }))
  }
  return deducirIndice(capitulos, tituloLibro)
}

/**
 * El número que se enseña de cada capítulo (en el orden que vienen), o null si
 * es preliminar, una parte, lo del final o una página vacía.
 */
export function numerarCapitulos(capitulos: CapituloNumerable[], tituloLibro: string): (number | null)[] {
  return estructurarIndice(capitulos, tituloLibro).map((l) => l.numero)
}

/**
 * RESPALDO v1. Lo que va ANTES del primer capítulo de verdad (sinopsis,
 * portadilla, créditos, dedicatoria, prólogo, una «Sección 4» sin título) no se
 * numera. Si un capítulo dice ser el primero («1 • Tengo un accidente…»,
 * «Capítulo primero»), la cuenta empieza ahí (2026-11-12: «La diosa de tres
 * cabezas» decía «Capítulo 4 de 46» en sus créditos), salvo que antes haya
 * demasiado libro (CF-04: el «Capítulo 1» de adelanto de otra novela al final).
 * Las partes no consumen número (CF-05); los trozos «(parte k de n)» heredan el
 * del primero (CF-06); el bloque de agradecimientos, notas, «sobre la autora»…
 * del final va sin número.
 */
function deducirIndice(capitulos: readonly CapituloNumerable[], tituloLibro: string): LugarEnIndice[] {
  const vacio = (c: CapituloNumerable) => c.minutos === 0
  const total = capitulos.reduce((s, c) => s + Math.max(0, c.minutos ?? 0), 0)
  const esTrozoDe = (i: number, j: number) =>
    i >= 0 &&
    j < capitulos.length &&
    SUFIJO_TROZO.test(capitulos[j].titulo) &&
    sinTrozo(capitulos[j].titulo) === sinTrozo(capitulos[i].titulo)
  // Se llama como el libro pero es el primer trozo de un bloque, o es largo: es texto (CF-06).
  const portadilla = (c: CapituloNumerable, i: number) => {
    if (!esPreliminar(c.titulo, tituloLibro)) return false
    if (PRELIMINAR.test(c.titulo.trim())) return true
    return !esTrozoDe(i, i + 1) && (c.minutos ?? 0) <= MINUTOS_NO_PORTADILLA
  }
  const delante = (c: CapituloNumerable, i: number) =>
    portadilla(c, i) || SIN_TITULO.test(c.titulo.trim()) || PRELIMINAR_SI_VA_DELANTE.test(c.titulo.trim())

  // El ancla «Capítulo 1» solo si antes no hay más que preliminares (o muy poco libro).
  const limite = Math.max(12, Math.ceil(capitulos.length * 0.25))
  let ancla = capitulos.findIndex((c, i) => i < limite && !vacio(c) && PRIMERO.test(c.titulo))
  if (ancla > 0) {
    const antes = capitulos.slice(0, ancla)
    const cuerpoAntes = antes.filter((c, i) => !vacio(c) && !delante(c, i) && !esParte(c.titulo)).length
    const minutosAntes = antes.reduce((s, c) => s + Math.max(0, c.minutos ?? 0), 0)
    if (cuerpoAntes > MAX_CUERPO_ANTES_DEL_ANCLA && minutosAntes > total * MAX_FRACCION_ANTES_DEL_ANCLA) ancla = -1
  }

  // El bloque del final: desde atrás, mientras sean «finales» o páginas vacías.
  let inicioFinal = capitulos.length
  for (let i = capitulos.length - 1; i >= 0; i--) {
    const c = capitulos[i]
    if (vacio(c) || FINAL.test(sinTrozo(c.titulo).trim())) inicioFinal = i
    else break
  }

  let n = 0
  let empezado = false
  const lugares = capitulos.map((c, i): LugarEnIndice => {
    const parte = esParte(c.titulo)
    if (!empezado) {
      const preliminar = ancla > 0 ? i < ancla : ancla < 0 && (delante(c, i) || parte)
      // «Primera parte» justo antes del capítulo 1 ya es la cabecera del cuerpo, no algo de «antes de empezar».
      if (preliminar && parte) return { numero: null, region: 'cuerpo', parte: true }
      if (vacio(c) || preliminar) return { numero: null, region: 'antes', parte: false }
    }
    if (i >= inicioFinal && empezado) return { numero: null, region: 'despues', parte: false }
    if (parte) return { numero: null, region: 'cuerpo', parte: true }
    if (vacio(c)) return { numero: null, region: 'cuerpo', parte: false }
    empezado = true
    // Un trozo «(parte k de n)» lleva el número de su capítulo.
    if (i > 0 && esTrozoDe(i - 1, i) && n > 0) return { numero: n, region: 'cuerpo', parte: false }
    n += 1
    return { numero: n, region: 'cuerpo', parte: false }
  })
  if (n > 0) return lugares
  // Ni un capítulo «de verdad» (un TXT que se llama como el libro): se numera todo lo que tiene texto (CF-17).
  let k = 0
  return capitulos.map((c): LugarEnIndice => ({ numero: vacio(c) ? null : ++k, region: 'cuerpo', parte: false }))
}
