import type { CeldaCruda, HojaDeCalculo, LibroDeHojas } from '@componentes/hoja/tipos'

/*
 * LA GEOMETRÍA DEL VISOR DE HOJAS, SIN DOM.
 *
 * Todo lo que decide qué se pinta y dónde vive aquí, en funciones puras y
 * probadas: el visor web solo pide "qué filas y columnas caben ahora" y pinta
 * eso. Así una hoja de 5 000 × 200 (250 000 celdas) se mueve igual de fluida
 * que una de 10 × 5: en pantalla nunca hay más de unos cientos de celdas.
 */

/** Alto de fila por defecto (px a zoom 1). */
export const ALTO_FILA = 24
/** Alto de la cabecera de letras A B C… */
export const ALTO_LETRAS = 24
/** Ancho de la columna de números de fila. */
export const ANCHO_NUMEROS = 44
/** Ancho de columna si el archivo no dice nada. */
export const ANCHO_COLUMNA = 96
export const ANCHO_MINIMO = 24
export const ANCHO_MAXIMO = 600
/** Tamaño de letra de las celdas a zoom 1 (= fontSize.xs: nada se escribe más pequeño). */
export const LETRA = 14

export const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const
export const ZOOM_MIN = ZOOMS[0]
export const ZOOM_MAX = ZOOMS[ZOOMS.length - 1]

/** El siguiente escalón de zoom hacia arriba (+1) o hacia abajo (-1). */
export function siguienteZoom(actual: number, sentido: 1 | -1): number {
  if (sentido > 0) return ZOOMS.find((z) => z > actual + 1e-6) ?? ZOOM_MAX
  return [...ZOOMS].reverse().find((z) => z < actual - 1e-6) ?? ZOOM_MIN
}

export const limitarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

// ------------------------------------------------------------------ nombres

/** 0 → A, 25 → Z, 26 → AA, 701 → ZZ, 702 → AAA. */
export function letraColumna(indice: number): string {
  let n = Math.max(0, Math.floor(indice)) + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** (6, 1) → "B7". */
export const nombreCelda = (fila: number, columna: number) => `${letraColumna(columna)}${fila + 1}`

/** Clave numérica de una celda (cabe en un double sin perder nada para 1 048 576 × 65 536). */
export const clave = (fila: number, columna: number) => fila * 65536 + columna

// ------------------------------------------------------------------ medidas

/** Anchos de la hoja con lo que la persona haya arrastrado encima (px a zoom 1). */
export function anchosDe(hoja: HojaDeCalculo, ajustes: Record<number, number> = {}): number[] {
  const r: number[] = []
  for (let c = 0; c < hoja.columnas; c++) {
    const propio = ajustes[c] ?? hoja.anchos[c]
    const w = propio == null || !Number.isFinite(propio) || propio <= 0 ? ANCHO_COLUMNA : propio
    r.push(Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, w)))
  }
  return r
}

/** Altos de todas las filas (px a zoom 1): los propios y el de por defecto. */
export function altosDe(hoja: HojaDeCalculo): number[] {
  const r = new Array<number>(hoja.filas).fill(ALTO_FILA)
  for (const [fila, alto] of hoja.altos) {
    if (fila < hoja.filas && alto > 0) r[fila] = Math.max(16, alto)
  }
  return r
}

/** Sumas acumuladas: `pos[i]` = dónde empieza el elemento i; `pos[n]` = el total. Ya con el zoom aplicado. */
export function acumulados(tamanos: number[], zoom = 1): Float64Array {
  const pos = new Float64Array(tamanos.length + 1)
  for (let i = 0; i < tamanos.length; i++) pos[i + 1] = pos[i] + tamanos[i] * zoom
  return pos
}

/** El índice cuyo tramo contiene `x` (búsqueda binaria). Fuera de rango, el borde más cercano. */
export function indiceEn(pos: Float64Array, x: number): number {
  const n = pos.length - 1
  if (n <= 0) return 0
  if (x <= pos[0]) return 0
  if (x >= pos[n]) return n - 1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (pos[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

export interface Rango {
  inicio: number
  /** Inclusivo. fin < inicio = vacío. */
  fin: number
}

/**
 * Qué elementos (filas o columnas) se ven en una zona que empieza en el
 * elemento `desde` (lo de antes está inmovilizado), con el desplazamiento
 * `scroll` y `tam` px de vista, más `margen` elementos a cada lado.
 */
export function rangoVisible(pos: Float64Array, desde: number, scroll: number, tam: number, margen = 3): Rango {
  const n = pos.length - 1
  if (desde >= n || tam <= 0) return { inicio: desde, fin: desde - 1 }
  const base = pos[desde]
  const a = indiceEn(pos, base + Math.max(0, scroll))
  const b = indiceEn(pos, base + Math.max(0, scroll) + tam - 0.01)
  return { inicio: Math.max(desde, a - margen), fin: Math.min(n - 1, b + margen) }
}

/** Lo que se ve de un rango (para no recalcular el render si no cambió). */
export const mismoRango = (a: Rango, b: Rango) => a.inicio === b.inicio && a.fin === b.fin

// ------------------------------------------------------------------ índice de la hoja

export interface Combinada {
  f1: number
  c1: number
  f2: number
  c2: number
}

export interface IndiceHoja {
  /** fila → (columna → celda). Se arma UNA vez al cargar la hoja. */
  porFila: Map<number, Map<number, CeldaCruda>>
  /** Clave del ancla → su combinada. */
  anclas: Map<number, Combinada>
  /** Claves de las celdas tapadas por una combinada (el ancla incluida). */
  tapadas: Set<number>
  combinadas: Combinada[]
}

/** Recorta una combinada a la rejilla; null si no tiene sentido (fuera, o de una sola celda). */
function normalizarCombinada(h: HojaDeCalculo, [a, b, c, d]: [number, number, number, number]): Combinada | null {
  const f1 = Math.min(a, c)
  const f2 = Math.min(Math.max(a, c), h.filas - 1)
  const c1 = Math.min(b, d)
  const c2 = Math.min(Math.max(b, d), h.columnas - 1)
  if (f1 >= h.filas || c1 >= h.columnas) return null
  if (f1 === f2 && c1 === c2) return null
  return { f1, c1, f2, c2 }
}

export function indexar(hoja: HojaDeCalculo): IndiceHoja {
  const porFila = new Map<number, Map<number, CeldaCruda>>()
  for (const celda of hoja.celdas) {
    const [f, c] = celda
    if (f >= hoja.filas || c >= hoja.columnas) continue
    let fila = porFila.get(f)
    if (!fila) porFila.set(f, (fila = new Map()))
    fila.set(c, celda)
  }
  const anclas = new Map<number, Combinada>()
  const tapadas = new Set<number>()
  const combinadas: Combinada[] = []
  for (const cruda of hoja.combinadas) {
    const m = normalizarCombinada(hoja, cruda)
    if (!m || tapadas.has(clave(m.f1, m.c1))) continue
    combinadas.push(m)
    anclas.set(clave(m.f1, m.c1), m)
    for (let f = m.f1; f <= m.f2; f++) for (let c = m.c1; c <= m.c2; c++) tapadas.add(clave(f, c))
  }
  return { porFila, anclas, tapadas, combinadas }
}

export const celdaEn = (ind: IndiceHoja, fila: number, columna: number): CeldaCruda | undefined =>
  ind.porFila.get(fila)?.get(columna)

/** La combinada que contiene esa celda (o null). Lineal en el nº de combinadas: solo al tocar una celda. */
export function combinadaDe(ind: IndiceHoja, fila: number, columna: number): Combinada | null {
  if (!ind.tapadas.has(clave(fila, columna))) return null
  return ind.combinadas.find((m) => fila >= m.f1 && fila <= m.f2 && columna >= m.c1 && columna <= m.c2) ?? null
}

/** Las combinadas que tocan un rectángulo de filas × columnas (aunque su ancla quede fuera). */
export function combinadasQueTocan(ind: IndiceHoja, filas: Rango, columnas: Rango): Combinada[] {
  if (filas.fin < filas.inicio || columnas.fin < columnas.inicio) return []
  return ind.combinadas.filter(
    (m) => m.f1 <= filas.fin && m.f2 >= filas.inicio && m.c1 <= columnas.fin && m.c2 >= columnas.inicio,
  )
}

// ------------------------------------------------------------------ búsqueda

/** Sin tildes, sin mayúsculas y sin espacios repetidos: "Año  Fiscal" ≈ "ano fiscal". */
export function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface Coincidencia {
  hoja: number
  fila: number
  columna: number
}

/** Todas las celdas que contienen el texto, hoja por hoja y en cada una fila → columna. */
export function buscar(
  libro: LibroDeHojas,
  consulta: string,
  /** Textos ya normalizados por hoja: la segunda búsqueda no vuelve a quitar tildes a 250 000 celdas. */
  cache: WeakMap<HojaDeCalculo, string[]> = new WeakMap(),
): Coincidencia[] {
  const q = normalizarTexto(consulta)
  if (!q) return []
  const r: Coincidencia[] = []
  libro.hojas.forEach((hoja, h) => {
    let textos = cache.get(hoja)
    if (!textos) {
      textos = hoja.celdas.map((c) => normalizarTexto(c[2]))
      cache.set(hoja, textos)
    }
    const propias: Coincidencia[] = []
    hoja.celdas.forEach(([fila, columna], i) => {
      if (fila < hoja.filas && columna < hoja.columnas && textos[i].includes(q)) {
        propias.push({ hoja: h, fila, columna })
      }
    })
    propias.sort((a, b) => a.fila - b.fila || a.columna - b.columna)
    r.push(...propias)
  })
  return r
}

// ------------------------------------------------------------------ ajustes de la persona

/** Ancho aproximado para que quepa el texto más largo de la columna (doble toque en su borde). */
export function anchoAlContenido(hoja: HojaDeCalculo, ind: IndiceHoja, columna: number): number {
  let mayor = letraColumna(columna).length
  for (const fila of ind.porFila.values()) {
    const celda = fila.get(columna)
    if (celda && !ind.tapadas.has(clave(celda[0], columna))) {
      const largo = Math.max(...celda[2].split('\n').map((l) => l.length))
      if (largo > mayor) mayor = largo
    }
  }
  return Math.min(ANCHO_MAXIMO, Math.max(40, Math.round(mayor * LETRA * 0.58 + 14)))
}

/**
 * Cuánto desplazar para que la celda se vea entera fuera de las zonas fijas.
 * `x`/`y` son las posiciones de la vista (scrollLeft/Top); `vistaAncho/Alto`,
 * lo que queda para el cuerpo tras la cabecera y lo inmovilizado.
 */
export function desplazarPara(
  posX: Float64Array,
  posY: Float64Array,
  fijas: { filas: number; columnas: number },
  fila: number,
  columna: number,
  vista: { x: number; y: number; ancho: number; alto: number },
): { x: number; y: number } {
  let { x, y } = vista
  if (columna >= fijas.columnas && columna < posX.length - 1) {
    const ini = posX[columna] - posX[fijas.columnas]
    const fin = posX[columna + 1] - posX[fijas.columnas]
    if (ini < x) x = ini
    else if (fin > x + vista.ancho) x = Math.min(ini, fin - vista.ancho)
  }
  if (fila >= fijas.filas && fila < posY.length - 1) {
    const ini = posY[fila] - posY[fijas.filas]
    const fin = posY[fila + 1] - posY[fijas.filas]
    if (ini < y) y = ini
    else if (fin > y + vista.alto) y = Math.min(ini, fin - vista.alto)
  }
  return { x: Math.max(0, x), y: Math.max(0, y) }
}

/** Filas y columnas inmovilizadas que caben de verdad (nunca toda la hoja, como mucho 5 filas y 3 columnas). */
export function fijasDe(hoja: HojaDeCalculo): { filas: number; columnas: number } {
  return {
    filas: Math.max(0, Math.min(hoja.fijas.filas, 5, Math.max(0, hoja.filas - 1))),
    columnas: Math.max(0, Math.min(hoja.fijas.columnas, 3, Math.max(0, hoja.columnas - 1))),
  }
}

/** "Se muestran las primeras 5 000 filas de 12 000" (o columnas, o las dos). */
export function avisoRecorte(hoja: HojaDeCalculo): string | null {
  if (!hoja.recortada && hoja.filasOriginal <= hoja.filas && hoja.columnasOriginal <= hoja.columnas) return null
  const miles = (n: number) => n.toLocaleString('es-CO')
  const partes: string[] = []
  if (hoja.filasOriginal > hoja.filas)
    partes.push(`las primeras ${miles(hoja.filas)} filas de ${miles(hoja.filasOriginal)}`)
  if (hoja.columnasOriginal > hoja.columnas)
    partes.push(`las primeras ${miles(hoja.columnas)} columnas de ${miles(hoja.columnasOriginal)}`)
  if (!partes.length) return 'La hoja es muy grande: se muestra solo una parte.'
  return `Se muestran ${partes.join(' y ')}.`
}

/** Alineación por defecto según lo que hay en la celda. */
export function alineacionPorDefecto(tipo: CeldaCruda[3]): 'izquierda' | 'centro' | 'derecha' {
  if (tipo === 'n' || tipo === 'f') return 'derecha'
  if (tipo === 'b' || tipo === 'e') return 'centro'
  return 'izquierda'
}
