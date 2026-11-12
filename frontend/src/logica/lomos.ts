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

/*
 * EL TEXTO DEL LOMO (legible en el teléfono).
 *
 * Antes el título iba en `writing-mode: vertical-rl` en una sola línea con
 * elipsis: en un lomo de 40 px solo cabían 8 o 9 letras ("Los pilare…") y en
 * Safari de iPhone el título llegaba a desaparecer y solo quedaba el apellido
 * del autor cortado abajo ("Maxw…"). Ahora el texto se COMPONE aquí, como lo
 * haría un encuadernador: se busca el tamaño más grande (entre 14 y 20 px) al
 * que el título cabe entero en el largo útil del lomo, en una línea o en dos
 * (si el grosor da para dos), cortando por palabras y equilibrando las líneas.
 * Si ni así cabe, se corta por la última palabra entera con "…". El apellido
 * del autor solo se pone si cabe ENTERO sin encoger el título; si no, se quita.
 * Lomo.tsx pinta el resultado en horizontal y lo gira 90° (igual en todos los
 * navegadores; el vertical-rl de Safari era el que fallaba).
 */

/** Tamaños del título del lomo (px, sin escala). 14 es el mínimo de la escala del proyecto (fontSize.xs). */
export const TAM_TITULO_MAX = 20
export const TAM_TITULO_MIN = 14
/** El apellido del autor va siempre a 14: o se lee entero, o no va. */
export const TAM_AUTOR = 14
/** Interlineado del título (Cormorant tiene ascendentes altas, pero no necesita más). */
export const INTERLINEA = 1.1
/** Margen de cada extremo del lomo (bandas doradas y aire): el texto vive entre los dos. */
export const MARGEN_EXTREMO = 24
/** Relleno a cada lado del grosor. */
export const RELLENO_GROSOR = 4
/** Hueco entre el título y el autor. */
export const HUECO_AUTOR = 10
/** Espaciado entre letras del título (px). */
export const ESPACIADO_TITULO = 0.6

export type EstiloTexto = 'titulo' | 'autor'
/** Mide el ancho en px de un texto a un tamaño. La web mide con canvas; las pruebas y el nativo, con la estimación. */
export type Medidor = (texto: string, tam: number, estilo: EstiloTexto) => number

/* Anchos medios por carácter de Cormorant Garamond (en em), un poco por lo alto para no quedarse cortos. */
const ESTRECHAS = new Set([..."iljtfrI.,;:'’!|()-‐"])
const ANCHAS = new Set([...'mwMWŒœÆæ'])
const anchoLetra = (c: string): number => {
  if (c === ' ') return 0.25
  if (ESTRECHAS.has(c)) return 0.3
  if (ANCHAS.has(c)) return 0.78
  if (/\d/.test(c)) return 0.5
  if (c !== c.toLowerCase()) return 0.66
  return 0.47
}

/** La estimación de ancho (sin DOM): suma de anchos medios por letra más el espaciado. */
export const medirEstimado: Medidor = (texto, tam, estilo) => {
  let em = 0
  for (const c of texto) em += anchoLetra(c)
  const espaciado = estilo === 'titulo' ? ESPACIADO_TITULO * texto.length : 0
  return em * tam * (estilo === 'autor' ? 0.95 : 1) + espaciado
}

/** Palabras que no deben quedarse colgando al final de la primera línea. */
const DEBILES = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'por',
  'un',
  'una',
  'y',
  'e',
  'o',
  'u',
  'the',
  'of',
  'and',
  'a',
  'an',
  'to',
])

export interface TextoLomo {
  /** Las líneas del título, ya cortadas (1 o 2). */
  lineas: string[]
  /** Tamaño del título (px, sin escala). */
  tam: number
  /** Alto de línea del título (px, sin escala). */
  alturaLinea: number
  /** El apellido del autor, solo si cabe entero; si no, null. */
  autor: string | null
  /** El título cupo entero (sin "…"). */
  completo: boolean
}

/** El largo útil del lomo para el texto (px, sin escala): el alto menos los dos extremos. */
export const largoUtil = (alto: number) => Math.max(40, alto - 2 * MARGEN_EXTREMO)
/** El grosor útil del lomo para las líneas (px, sin escala). */
export const grosorUtil = (grosor: number) => Math.max(16, grosor - 2 * RELLENO_GROSOR)

const lineasQueCaben = (grosor: number, tam: number) => Math.min(2, Math.floor(grosor / (tam * INTERLINEA)))

/** La mejor forma de partir las palabras en n líneas que quepan en `largo` (null si no hay). */
/**
 * Qué cortes se admiten: solo tras puntuación ("Sapiens. / De animales…"),
 * los limpios (sin un "y" o un "de" colgando al final de la primera línea) o
 * cualquiera. componerTitulo prueba en ese orden y se queda con el primero que
 * no cueste más de 2 px de tamaño frente a "cualquiera".
 */
type Corte = 'puntuacion' | 'limpio' | 'libre'
const PREFERENCIA_CORTES: Corte[] = ['puntuacion', 'limpio', 'libre']
const admite = (corte: Corte, fin: string) =>
  corte === 'libre' ? true : corte === 'limpio' ? !DEBILES.has(fin.toLowerCase()) : /[.:;]$/.test(fin)

function partir(
  palabras: string[],
  n: number,
  largo: number,
  tam: number,
  medir: Medidor,
  corte: Corte = 'libre',
): string[] | null {
  if (n === 1) {
    const l = palabras.join(' ')
    return medir(l, tam, 'titulo') <= largo ? [l] : null
  }
  if (palabras.length < 2) return null
  let mejor: string[] | null = null
  let puntos = Infinity
  for (let k = 1; k < palabras.length; k++) {
    const a = palabras.slice(0, k).join(' ')
    const b = palabras.slice(k).join(' ')
    const wa = medir(a, tam, 'titulo')
    const wb = medir(b, tam, 'titulo')
    if (wa > largo || wb > largo || !admite(corte, palabras[k - 1])) continue
    /* Líneas parejas: gana el corte cuya línea más larga es más corta. */
    const p = Math.max(wa, wb)
    if (p < puntos) {
      puntos = p
      mejor = [a, b]
    }
  }
  return mejor
}

/** Corta una palabra sola por letras hasta que quepa con "…" (solo para palabras más largas que el lomo). */
function cortarPalabra(palabra: string, largo: number, tam: number, medir: Medidor): string {
  let p = palabra
  while (p.length > 1 && medir(`${p}…`, tam, 'titulo') > largo) p = p.slice(0, -1)
  return `${p}…`
}

/** Llena las líneas a TAM_TITULO_MIN y termina con "…" tras la última palabra que quepa. */
function recortar(palabras: string[], n: number, largo: number, medir: Medidor): string[] {
  const tam = TAM_TITULO_MIN
  const lineas: string[] = []
  let i = 0
  for (let li = 0; li < n && i < palabras.length; li++) {
    const ultima = li === n - 1
    let linea = ''
    while (i < palabras.length) {
      const prueba = linea ? `${linea} ${palabras[i]}` : palabras[i]
      const quedan = i < palabras.length - 1
      const conPuntos = ultima && quedan ? `${prueba} …` : prueba
      if (medir(conPuntos, tam, 'titulo') > largo) break
      linea = prueba
      i++
    }
    if (!linea) {
      /* Ni la primera palabra cabe: se corta esa palabra (único caso de corte a mitad de palabra). */
      lineas.push(cortarPalabra(palabras[i], largo, tam, medir))
      return lineas
    }
    if (ultima && i < palabras.length) {
      /* "…irrefutables…" y no "…irrefutables del…": las palabras débiles no se quedan antes del corte. */
      const p = linea.split(' ')
      while (p.length > 1 && DEBILES.has(p[p.length - 1].toLowerCase())) p.pop()
      lineas.push(`${p.join(' ').replace(/[\s,;:.-]+$/, '')}…`)
    } else lineas.push(linea)
  }
  return lineas
}

/** Compone el título en el espacio dado: el mayor tamaño al que cabe entero, en 1 o 2 líneas. */
export function componerTitulo(
  titulo: string,
  largo: number,
  grosor: number,
  medir: Medidor = medirEstimado,
): Omit<TextoLomo, 'autor'> {
  const palabras = titulo.trim().split(/\s+/).filter(Boolean)
  if (!palabras.length) {
    return { lineas: [''], tam: TAM_TITULO_MIN, alturaLinea: Math.round(TAM_TITULO_MIN * INTERLINEA), completo: true }
  }
  const mejorCon = (corte: Corte) => {
    for (let tam = TAM_TITULO_MAX; tam >= TAM_TITULO_MIN; tam -= 0.5) {
      const max = lineasQueCaben(grosor, tam)
      for (let n = 1; n <= max; n++) {
        const lineas = partir(palabras, n, largo, tam, medir, corte)
        if (lineas) return { lineas, tam, alturaLinea: Math.round(tam * INTERLINEA * 10) / 10, completo: true }
      }
    }
    return null
  }
  const libre = mejorCon('libre')
  if (libre) {
    for (const corte of PREFERENCIA_CORTES) {
      const r = corte === 'libre' ? libre : mejorCon(corte)
      if (r && r.tam >= libre.tam - 2) return r
    }
  }
  const n = Math.max(1, lineasQueCaben(grosor, TAM_TITULO_MIN))
  return {
    lineas: recortar(palabras, n, largo, medir),
    tam: TAM_TITULO_MIN,
    alturaLinea: Math.round(TAM_TITULO_MIN * INTERLINEA * 10) / 10,
    completo: false,
  }
}

const PARTICULAS = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'da',
  'das',
  'do',
  'dos',
  'di',
  'du',
  'van',
  'von',
  'der',
  'den',
  'le',
  'mac',
  'y',
])
const esInicial = (p: string) => /^(\p{Lu}\.)+$/u.test(p) || /^\p{Lu}\.?-\p{Lu}\.$/u.test(p)

/**
 * Cómo se llama al autor en un lomo, de más largo a más corto: "García Márquez"
 * y luego "García"; "Cervantes Saavedra" y "Cervantes"; "Le Guin"; "Riordan".
 * Las iniciales ("J. K.") no van. Los apellidos dobles se reconocen por una
 * partícula ("de") o porque el nombre es hispano (lleva tildes o eñes).
 */
export function apellidosParaLomo(autor: string | null | undefined): string[] {
  const p = (autor ?? '')
    .trim()
    .split(/\s+/)
    .filter((x) => x && !esInicial(x))
  if (!p.length) return []
  if (p.length === 1) return [p[0]]
  let apellido: string[]
  let partible = true
  const particula = p.findIndex((x, i) => i > 0 && i < p.length - 1 && PARTICULAS.has(x) && x === x.toLowerCase())
  if (particula === 1) {
    /* "Miguel de Cervantes Saavedra" → "Cervantes Saavedra"; "Antoine de Saint-Exupéry" → "Saint-Exupéry". */
    apellido = p.slice(2)
    while (apellido.length > 1 && PARTICULAS.has(apellido[0])) apellido = apellido.slice(1)
  } else if (particula > 1) {
    /* "Pedro Calderón de la Barca" → "Calderón de la Barca", y si no cabe, "Calderón". */
    apellido = p.slice(particula - 1)
    const lista = [apellido.join(' ')]
    if (apellido.length > 1) lista.push(apellido[0])
    return lista
  } else if (p.length >= 3 && PARTICULAS.has(p[p.length - 2].toLowerCase())) {
    apellido = p.slice(-2) // "Le Guin", "Van Gogh": no se parte
    partible = false
  } else if (p.length >= 3 && /[áéíóúñü]/i.test(p.join(' '))) apellido = p.slice(-2)
  else apellido = p.slice(-1)
  const lista = [apellido.join(' ')]
  if (partible && apellido.length >= 2) lista.push(apellido[0])
  return lista
}

/**
 * El texto completo del lomo para unas medidas SIN escala: el título compuesto
 * y, si cabe entero sin encoger el título por debajo de lo que tendría solo
 * (o de 16 px), el apellido del autor.
 */
export function textoDelLomo(
  libro: Pick<EjemplarDTO, 'titulo' | 'autores'>,
  medidas: DimensionesLomo,
  medir: Medidor = medirEstimado,
): TextoLomo {
  const largo = largoUtil(medidas.alto)
  const grosor = grosorUtil(medidas.grosor)
  const solo = componerTitulo(libro.titulo, largo, grosor, medir)
  if (grosor < TAM_AUTOR * INTERLINEA) return { ...solo, autor: null }
  for (const autor of apellidosParaLomo(libro.autores?.[0])) {
    const ancho = medir(autor, TAM_AUTOR, 'autor')
    if (ancho > largo * 0.42) continue
    const con = componerTitulo(libro.titulo, largo - ancho - HUECO_AUTOR, grosor, medir)
    if (con.completo && con.tam >= Math.min(solo.tam, 16)) return { ...con, autor }
  }
  return { ...solo, autor: null }
}
