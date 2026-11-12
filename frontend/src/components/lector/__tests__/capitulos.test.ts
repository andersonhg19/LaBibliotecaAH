import { conAlfa } from '@componentes/lector/IndicadorCapitulo'
import {
  capituloEn,
  entradaActual,
  etiquetaIndicador,
  minutosQuedanCapitulo,
  porcentajeCapitulo,
  textoIndicador,
  tramosDeCapitulos,
  vecinos,
} from '@componentes/lector/capitulos'

/*
 * «No sé en qué parte del capítulo voy ni puedo cambiar de capítulo» (Anderson,
 * iPhone). El cálculo del indicador del pie, los vecinos de ‹ › y el capítulo
 * marcado en el índice.
 */

const SECCIONES = [
  { fraccion: 0, titulo: 'Prólogo', href: 'Text/cap-000.xhtml' },
  { fraccion: 0.1, titulo: 'Capítulo 1', href: 'Text/cap-001.xhtml' },
  // El capítulo 1 viene partido en dos archivos con el mismo título: es UN capítulo.
  { fraccion: 0.25, titulo: 'Capítulo 1', href: 'Text/cap-001b.xhtml' },
  { fraccion: 0.4, titulo: 'Capítulo 2', href: 'Text/cap-002.xhtml' },
  { fraccion: 0.8, titulo: 'Epílogo', href: 'Text/cap-003.xhtml#e' },
]

describe('Los capítulos del libro (tramos)', () => {
  it('ordena, junta los partidos y cada uno acaba donde empieza el siguiente', () => {
    const t = tramosDeCapitulos([...SECCIONES].reverse())
    expect(t.map((x) => [x.titulo, x.inicio, x.fin])).toEqual([
      ['Prólogo', 0, 0.1],
      ['Capítulo 1', 0.1, 0.4],
      ['Capítulo 2', 0.4, 0.8],
      ['Epílogo', 0.8, 1],
    ])
    expect(t.map((x) => x.indice)).toEqual([0, 1, 2, 3])
  })

  it('sin índice no hay capítulos (y no revienta)', () => {
    expect(tramosDeCapitulos([])).toEqual([])
    expect(tramosDeCapitulos([{ fraccion: 0.2, titulo: '  ' }])).toEqual([])
    expect(capituloEn(0.5, [])).toBeNull()
  })
})

describe('El avance DENTRO del capítulo', () => {
  const t = tramosDeCapitulos(SECCIONES)

  it('a mitad del capítulo 1 (de 0,10 a 0,40 del libro) dice 50 %', () => {
    const p = capituloEn(0.25, t)
    expect(p?.tramo.titulo).toBe('Capítulo 1')
    expect(p?.avance).toBeCloseTo(0.5)
  })

  it('al empezar un capítulo es 0 % de ESE capítulo, no 100 % del anterior', () => {
    expect(capituloEn(0.4, t)?.tramo.titulo).toBe('Capítulo 2')
    expect(capituloEn(0.4, t)?.avance).toBe(0)
  })

  it('el último capítulo llega al final del libro', () => {
    expect(capituloEn(0.9, t)?.avance).toBeCloseTo(0.5)
    expect(capituloEn(1, t)?.avance).toBe(1)
  })

  it('antes del primer capítulo (portada) no hay capítulo', () => {
    const sinPortada = tramosDeCapitulos([{ fraccion: 0.05, titulo: 'Uno' }])
    expect(capituloEn(0.01, sinPortada)).toBeNull()
  })

  it('el porcentaje no dice 100 % mientras quede texto', () => {
    expect(porcentajeCapitulo(0.996)).toBe(99)
    expect(porcentajeCapitulo(1)).toBe(100)
    expect(porcentajeCapitulo(0.454)).toBe(45)
    expect(porcentajeCapitulo(Number.NaN)).toBe(0)
  })
})

describe('El texto del indicador: «Capítulo 7 · 45 % · quedan 6 min»', () => {
  const t = tramosDeCapitulos(SECCIONES)

  it('con minutos', () => {
    const p = capituloEn(0.235, t)
    expect(textoIndicador(p, 6, 0.235)).toEqual({ titulo: 'Capítulo 1', detalle: '45 % · quedan 6 min' })
    expect(etiquetaIndicador(p, 6, 0.235)).toBe(
      'Capítulo 1, vas por el 45 % del capítulo, quedan 6 min. Abrir el índice',
    )
  })

  it('sin minutos (libro sin voz): solo el porcentaje', () => {
    expect(textoIndicador(capituloEn(0.25, t), null, 0.25).detalle).toBe('50 %')
  })

  it('sin capítulo: el avance del libro', () => {
    expect(textoIndicador(null, null, 0.031)).toEqual({ titulo: 'Inicio del libro', detalle: '3 % del libro' })
  })
})

describe('‹ capítulo anterior / capítulo siguiente › en los extremos', () => {
  const t = tramosDeCapitulos(SECCIONES)

  it('en el primero no hay anterior', () => {
    const v = vecinos(t, t[0])
    expect(v.anterior).toBeNull()
    expect(v.siguiente?.titulo).toBe('Capítulo 1')
  })

  it('en el último no hay siguiente', () => {
    const v = vecinos(t, t[3])
    expect(v.anterior?.titulo).toBe('Capítulo 2')
    expect(v.siguiente).toBeNull()
  })

  it('en medio, los dos', () => {
    const v = vecinos(t, t[2])
    expect([v.anterior?.titulo, v.siguiente?.titulo]).toEqual(['Capítulo 1', 'Epílogo'])
  })

  it('antes del primer capítulo «siguiente» lleva al primero; sin capítulos, nada', () => {
    expect(vecinos(t, null)).toEqual({ anterior: null, siguiente: t[0] })
    expect(vecinos([], null)).toEqual({ anterior: null, siguiente: null })
  })
})

describe('El índice marca el capítulo de ahora', () => {
  const t = tramosDeCapitulos(SECCIONES)
  const INDICE = [
    { titulo: 'Prólogo', href: 'Text/cap-000.xhtml' },
    { titulo: 'Capítulo 1', href: 'Text/cap-001.xhtml' },
    { titulo: 'Capítulo 2', href: 'Text/cap-002.xhtml' },
    { titulo: 'Epílogo', href: 'Text/cap-003.xhtml#e' },
  ]

  it('por el destino del índice', () => {
    expect(entradaActual(INDICE, t[2], 'Capítulo 2')).toBe(2)
    expect(entradaActual(INDICE, t[3], null)).toBe(3)
  })

  it('si no coincide el destino, por el título que da foliate', () => {
    expect(entradaActual(INDICE, { ...t[1], href: 'otro.xhtml' }, 'Capítulo 1')).toBe(1)
  })

  it('si tampoco, por el archivo (sin el #ancla)', () => {
    expect(entradaActual(INDICE, { ...t[3], href: 'Text/cap-003.xhtml', titulo: 'x' }, null)).toBe(3)
  })

  it('sin capítulo, ninguno', () => {
    expect(entradaActual(INDICE, null, null)).toBe(-1)
  })
})

describe('La pastilla deja intuir el papel', () => {
  it('#RRGGBB → rgba', () => {
    expect(conAlfa('#1C110A', 0.92)).toBe('rgba(28,17,10,0.92)')
    expect(conAlfa('raro', 0.5)).toBe('raro')
  })
})

describe('Los capítulos largos que el taller parte en trozos («parte k de n») son UNO', () => {
  const TROZOS = [
    { fraccion: 0, titulo: 'Inicio' },
    { fraccion: 0.1, titulo: 'Capítulo 1' },
    { fraccion: 0.3, titulo: 'Capítulo 1 (parte 2 de 2)' },
    { fraccion: 0.5, titulo: 'Capítulo 2' },
  ]

  it('el indicador cuenta el capítulo entero y ‹ › salta los trozos', () => {
    const t = tramosDeCapitulos(TROZOS)
    expect(t.map((x) => [x.titulo, x.inicio, x.fin])).toEqual([
      ['Inicio', 0, 0.1],
      ['Capítulo 1', 0.1, 0.5],
      ['Capítulo 2', 0.5, 1],
    ])
    const p = capituloEn(0.4, t)
    expect(p?.tramo.titulo).toBe('Capítulo 1')
    expect(p?.avance).toBeCloseTo(0.75)
    expect(vecinos(t, p!.tramo).siguiente?.titulo).toBe('Capítulo 2')
  })

  it('el índice marca el trozo exacto en el que estás', () => {
    const t = tramosDeCapitulos(TROZOS)
    const indice = TROZOS.map((x) => ({ titulo: x.titulo, href: '' }))
    expect(entradaActual(indice, t[1], 'Capítulo 1 (parte 2 de 2)')).toBe(2)
  })

  it('«quedan N min» suma los trozos que vienen detrás', () => {
    const caps = [
      { indice: 3, titulo: 'Capítulo 1', minutos: 20 },
      { indice: 4, titulo: 'Capítulo 1 (parte 2 de 3)', minutos: 18 },
      { indice: 5, titulo: 'Capítulo 1 (parte 3 de 3)', minutos: 7 },
      { indice: 6, titulo: 'Capítulo 2', minutos: 30 },
    ]
    expect(minutosQuedanCapitulo(5, 3, caps)).toBe(30)
    expect(minutosQuedanCapitulo(5, 5, caps)).toBe(5)
    expect(minutosQuedanCapitulo(9, 6, caps)).toBe(9)
    expect(minutosQuedanCapitulo(null, 3, caps)).toBeNull()
    expect(minutosQuedanCapitulo(4, 99, caps)).toBe(4)
  })
})
