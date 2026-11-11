import fs from 'fs'
import path from 'path'

import { CSS_GLOBAL } from '@tema/estilosGlobales'
import { reducirMovimiento } from '@tema/web'

/**
 * ============================================================================
 * ACCESIBILIDAD TRANSVERSAL (estándares 30 y 35)
 * ============================================================================
 *
 * Hermanas de NadaInteractivoSinNombre y NadaSeEscribeMasPequeno. Recorren el
 * código y fallan diciendo el fichero y la línea:
 *
 *   1. OBJETIVOS TÁCTILES ≥ 44 px: todo pulsable usa un estilo con
 *      minHeight/height ≥ 44, o es de pantalla completa (absoluteFill).
 *   2. NADA SOLO POR COLOR: lo que se elige (radio, pestaña, casilla) declara
 *      su estado con accessibilityState; el lector dice "seleccionado", no el
 *      color de fondo.
 *   3. REDUCIR MOVIMIENTO: el CSS global apaga transiciones y animaciones si
 *      el sistema lo pide, y el efecto del libro físico lo consulta.
 */

const SRC = path.join(__dirname, '..')
const CARPETAS = ['screens', 'components', 'navigation'].map((c) => path.join(SRC, c))

function ficheros(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheros(p)
    return e.name.endsWith('.tsx') ? [p] : []
  })
}

/** Etiquetas de apertura completas (contando llaves, como NadaInteractivoSinNombre). */
function aperturas(fuente: string, patron: RegExp): { texto: string; linea: number }[] {
  const r: { texto: string; linea: number }[] = []
  let m: RegExpExecArray | null
  while ((m = patron.exec(fuente)) !== null) {
    let prof = 0
    let fin = m.index
    for (let j = m.index; j < fuente.length; j++) {
      const c = fuente[j]
      if (c === '{') prof++
      else if (c === '}') prof--
      else if (c === '>' && prof === 0 && fuente[j - 1] !== '=') {
        fin = j
        break
      }
    }
    r.push({ texto: fuente.slice(m.index, fin + 1), linea: fuente.slice(0, m.index).split('\n').length })
  }
  return r
}

/** Los estilos de StyleSheet.create con altura (o mínimo) de 44 o más. */
function estilosAltos(fuente: string): Set<string> {
  const altos = new Set<string>()
  const re = /(\w+)\s*:\s*\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente)) !== null) {
    const cuerpo = m[2]
    const alto = /(?:minHeight|height)\s*:\s*(\d+)/.exec(cuerpo)
    const ancho = /(?:minWidth|width)\s*:\s*(\d+)/.exec(cuerpo)
    if (alto && Number(alto[1]) >= 44) altos.add(m[1])
    else if (/\bflex\s*:\s*1\b/.test(cuerpo) && /minHeight\s*:\s*4[4-9]|minHeight\s*:\s*[5-9]\d/.test(cuerpo))
      altos.add(m[1])
    void ancho
  }
  return altos
}

describe('Objetivos táctiles de 44 px o más', () => {
  it('todo pulsable tiene al menos 44 de alto', () => {
    const pequenos: string[] = []
    for (const f of CARPETAS.flatMap(ficheros)) {
      const fuente = fs.readFileSync(f, 'utf8')
      const altos = estilosAltos(fuente)
      for (const { texto, linea } of aperturas(fuente, /<(Pressable|TouchableOpacity)[\s>]/g)) {
        if (/absoluteFill/.test(texto)) continue
        const refs = [...texto.matchAll(/styles\.(\w+)/g)].map((x) => x[1])
        const enLinea = /(minHeight|height)\s*:\s*(4[4-9]|[5-9]\d|\d{3})/.test(texto)
        if (!enLinea && !refs.some((r) => altos.has(r)))
          pequenos.push(`${path.relative(SRC, f).replace(/\\/g, '/')}:${linea}`)
      }
    }
    expect(pequenos).toEqual([])
  })
})

describe('Nada depende solo del color', () => {
  it('lo que se elige declara su estado (accessibilityState)', () => {
    const mudos: string[] = []
    for (const f of CARPETAS.flatMap(ficheros)) {
      const fuente = fs.readFileSync(f, 'utf8')
      for (const { texto, linea } of aperturas(fuente, /<(Pressable|TouchableOpacity|View)[\s>]/g)) {
        if (
          /accessibilityRole=(?:"|\{[^}]*')(radio|tab|checkbox)['"]/.test(texto) &&
          !/accessibilityState/.test(texto)
        ) {
          mudos.push(`${path.relative(SRC, f).replace(/\\/g, '/')}:${linea}`)
        }
      }
    }
    expect(mudos).toEqual([])
  })

  /*
   * UX-04: react-native-web 0.21 ya no traduce accessibilityState a aria-*: lo
   * que se elige pasa por estadoElegible() (utils/aria), que pone las dos cosas.
   * PENDIENTES: pantallas del lector y del reproductor (las lleva otro frente).
   */
  const PENDIENTES_ARIA = ['screens/lector/', 'screens/reproductor/', 'components/lector/', 'components/reproductor/']
  it('lo que se elige lleva su atributo ARIA (estadoElegible), no solo accessibilityState', () => {
    const sinAria: string[] = []
    for (const f of CARPETAS.flatMap(ficheros)) {
      const rel = path.relative(SRC, f).replace(/\\/g, '/')
      if (PENDIENTES_ARIA.some((p) => rel.startsWith(p))) continue
      const fuente = fs.readFileSync(f, 'utf8')
      for (const { texto, linea } of aperturas(fuente, /<(Pressable|TouchableOpacity|View)[\s>]/g)) {
        if (
          /accessibilityState=\{\{\s*(selected|checked)/.test(texto) &&
          !/aria-(selected|checked|pressed)/.test(texto)
        )
          sinAria.push(`${rel}:${linea}`)
      }
    }
    expect(sinAria).toEqual([])
  })

  it('los botones de DOM (role="button") también tienen nombre', () => {
    const mudos: string[] = []
    for (const f of CARPETAS.flatMap(ficheros)) {
      const fuente = fs.readFileSync(f, 'utf8')
      for (const { texto, linea } of aperturas(fuente, /<div[\s>]/g)) {
        if (/role="button"/.test(texto) && !/aria-label/.test(texto)) mudos.push(`${path.relative(SRC, f)}:${linea}`)
      }
    }
    expect(mudos).toEqual([])
  })
})

describe('Reducir movimiento', () => {
  it('el CSS global apaga transiciones y animaciones si el sistema lo pide', () => {
    expect(CSS_GLOBAL).toMatch(/@media \(prefers-reduced-motion: reduce\)\{[^}]*transition-duration:0\.001ms!important/)
    expect(CSS_GLOBAL).toMatch(/animation-duration:0\.001ms!important/)
  })
  it('el efecto del libro físico y el paso de página lo consultan', () => {
    const libro = fs.readFileSync(path.join(SRC, 'components/estanteria/LibroEnEstante.web.tsx'), 'utf8')
    const lector = fs.readFileSync(path.join(SRC, 'components/lector/LectorFoliate.web.tsx'), 'utf8')
    expect(libro).toMatch(/if \(reducirMovimiento\(\)\)/)
    expect(lector).toMatch(/reducirMovimiento\(\)/)
  })
  it('fuera de la web no hay preferencia que leer', () => expect(reducirMovimiento()).toBe(false))
})
