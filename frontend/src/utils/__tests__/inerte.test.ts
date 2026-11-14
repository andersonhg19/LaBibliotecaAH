import { cssDelLibro } from '@componentes/lector/cssLibro'
import { PREFERENCIAS_INICIALES, leerPreferencias, papelEfectivo } from '@contextos/PreferenciasContext'
import { FUENTES_LECTOR, formatoFuente } from '@tema/fuentes'
import { ponerInerte } from '@utils/inerte'

describe('E4 · la barra escondida del lector es inerte (UX5-04)', () => {
  it('pone y quita el atributo inert en el nodo del DOM', () => {
    const atributos = new Map<string, string>()
    const nodo = {
      setAttribute: (k: string, v: string) => atributos.set(k, v),
      removeAttribute: (k: string) => atributos.delete(k),
    }
    ponerInerte(nodo, true)
    expect(atributos.get('inert')).toBe('')
    ponerInerte(nodo, false)
    expect(atributos.has('inert')).toBe(false)
  })
  it('en nativo (sin DOM) no hace nada ni falla', () => {
    expect(() => ponerInerte(null, true)).not.toThrow()
    expect(() => ponerInerte({}, true)).not.toThrow()
  })
})

describe('E11 · el lector de día no abre en papel Noche (UX5-14)', () => {
  it('sin elegir, el papel sigue al ambiente', () => {
    expect(papelEfectivo(PREFERENCIAS_INICIALES, false)).toBe('marfil')
    expect(papelEfectivo(PREFERENCIAS_INICIALES, true)).toBe('noche')
  })
  it('elegido, manda lo elegido (también Noche de día)', () => {
    expect(papelEfectivo({ ...PREFERENCIAS_INICIALES, temaPapel: 'noche', papelElegido: true }, false)).toBe('noche')
    expect(papelEfectivo({ ...PREFERENCIAS_INICIALES, temaPapel: 'pergamino', papelElegido: true }, true)).toBe(
      'pergamino',
    )
  })
  it('preferencias guardadas antes de la 0.4.0: Noche (el de fábrica) no cuenta como elegido; otro papel sí', () => {
    expect(leerPreferencias(JSON.stringify({ ...PREFERENCIAS_INICIALES, temaPapel: 'noche' })).papelElegido).toBe(false)
    expect(leerPreferencias(JSON.stringify({ ...PREFERENCIAS_INICIALES, temaPapel: 'marfil' })).papelElegido).toBe(true)
    expect(leerPreferencias(null).papelElegido).toBeFalsy()
  })
})

describe('F13 · Atkinson Hyperlegible y OpenDyslexic en el lector', () => {
  it('se pueden elegir y se guardan', () => {
    expect(FUENTES_LECTOR.map((f) => f.clave)).toEqual(
      expect.arrayContaining(['literata', 'garamond', 'lora', 'atkinson', 'opendyslexic']),
    )
    expect(leerPreferencias(JSON.stringify({ fuente: 'opendyslexic' })).fuente).toBe('opendyslexic')
    expect(leerPreferencias(JSON.stringify({ fuente: 'comic-sans' })).fuente).toBe('literata')
  })
  it('el CSS del libro declara cada letra con su formato (woff2 u otf/ttf)', () => {
    const css = cssDelLibro({ ...PREFERENCIAS_INICIALES, fuente: 'opendyslexic' })
    expect(css).toContain("url('/fuentes/OpenDyslexic-Regular.woff2') format('woff2')")
    expect(css).toContain("url('/fuentes/AtkinsonHyperlegible-Regular.ttf') format('truetype')")
    expect(css).toContain("font-family:'OpenDyslexic', Verdana, sans-serif!important")
    expect(formatoFuente('x.woff2')).toBe('woff2')
  })
})
