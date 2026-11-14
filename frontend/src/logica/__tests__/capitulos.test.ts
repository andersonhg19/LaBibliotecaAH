import { esParte, estructurarIndice, numerarCapitulos, sinTrozo, tieneEstructura } from '@logica/capitulos'

/*
 * CASOS C2, C4, C5, C6 y C12 (scratchpad/olas/CASOS.md) y la auditoría de
 * conversión CF-02, CF-04, CF-05, CF-06 y CF-17: la numeración de RESPALDO
 * para los libros v1, y la estructura v2 del taller cuando llega (C3).
 */

const c = (titulo: string, minutos = 5) => ({ titulo, minutos })

describe('C2 · el capítulo 1 se reconoce de muchas formas (CF-02)', () => {
  it.each([
    'Capítulo primero',
    'CAPÍTULO PRIMERO',
    'CAPÍTULO 01',
    'Chapter 01',
    'Chapter One',
    'Chapter First',
    'Cap. 1',
    'I.',
    '1. La casa',
    'Capítulo I',
    'Capítulo uno',
  ])('«%s» = 1 y el prólogo de delante va sin número', (primero) => {
    const caps = [c('Prólogo'), c('Introducción'), c(primero), c('Capítulo 2')]
    expect(numerarCapitulos(caps, 'Libro')).toEqual([null, null, 1, 2])
  })

  it('sin ancla, un prólogo, un prefacio o una nota del autor delante tampoco cuentan', () => {
    const caps = [c('Prefacio'), c('Nota de la traductora'), c('Mapa'), c('El viaje'), c('La tormenta')]
    expect(numerarCapitulos(caps, 'Libro')).toEqual([null, null, null, 1, 2])
  })

  it('un «Prólogo» en mitad del libro sí es un capítulo', () => {
    const caps = [c('Capítulo 1'), c('Prólogo a la segunda parte'), c('Capítulo 2')]
    expect(numerarCapitulos(caps, 'Libro')).toEqual([1, 2, 3])
  })

  it('«Capítulo 10» o «1984» no anclan', () => {
    expect(numerarCapitulos([c('La llegada'), c('Capítulo 10')], 'X')).toEqual([1, 2])
    expect(numerarCapitulos([c('Créditos'), c('1984'), c('Dos')], 'X')).toEqual([null, 1, 2])
  })
})

describe('C4 · un «Capítulo 1» de adelanto al final no borra la numeración (CF-04)', () => {
  it('siete capítulos con nombre, agradecimientos, adelanto y «sobre la autora»', () => {
    const caps = [
      c('Dedicatoria', 1),
      c('La niebla'),
      c('El faro'),
      c('La carta'),
      c('El puerto'),
      c('La tormenta'),
      c('El regreso'),
      c('La luz'),
      c('Agradecimientos', 1),
      c('Capítulo 1', 6),
      c('Sobre la autora', 1),
    ]
    const n = numerarCapitulos(caps, 'La casa del faro')
    expect(n.slice(0, 8)).toEqual([null, 1, 2, 3, 4, 5, 6, 7])
    // El adelanto se numera como un capítulo más (no es «final»), pero «Sobre la autora» no.
    expect(n[10]).toBeNull()
    expect(estructurarIndice(caps, 'La casa del faro')[10].region).toBe('despues')
  })

  it('un ancla con poco libro delante sí vale (sinopsis + prólogo + mapa + dedicatoria)', () => {
    const caps = [
      c('Sinopsis', 1),
      c('Mapa', 1),
      c('Carta del autor', 2),
      c('Prólogo', 3),
      c('Capítulo 1'),
      c('Capítulo 2'),
    ]
    expect(numerarCapitulos(caps, 'X')).toEqual([null, null, null, null, 1, 2])
  })
})

describe('C5 · las partes son cabeceras sin número (CF-05)', () => {
  it('«Primera parte» + capítulos + «Segunda parte. El mar» + capítulos + epílogo', () => {
    const caps = [
      c('Primera parte', 0),
      c('Capítulo 1'),
      c('Capítulo 2'),
      c('Capítulo 3'),
      c('Segunda parte. El mar', 1),
      c('Capítulo 1'),
      c('Capítulo 2'),
      c('Capítulo 3'),
      c('Epílogo'),
    ]
    const l = estructurarIndice(caps, 'X')
    expect(l.map((x) => x.numero)).toEqual([null, 1, 2, 3, null, 4, 5, 6, 7])
    expect(l[0]).toEqual({ numero: null, region: 'cuerpo', parte: true })
    expect(l[4].parte).toBe(true)
    expect(l[8].region).toBe('cuerpo')
  })

  it.each(['Primera parte', 'Parte II', 'PARTE 3', 'Libro tercero', 'Part One', 'Book 2', 'Última parte'])(
    '«%s» es una parte',
    (t) => expect(esParte(t)).toBe(true),
  )
  it.each(['Capítulo 1', 'La parte de atrás', 'Libro de horas', 'Partes de un todo'])('«%s» no lo es', (t) =>
    expect(esParte(t)).toBe(false),
  )
})

describe('C6 · los trozos «(parte k de n)» heredan el número (CF-06)', () => {
  it('«Capítulo 2 (parte 2 de 3)» es el 2, no el 3', () => {
    const caps = [
      c('Capítulo 1'),
      c('Capítulo 2'),
      c('Capítulo 2 (parte 2 de 3)'),
      c('Capítulo 2 (parte 3 de 3)'),
      c('Capítulo 3'),
    ]
    expect(numerarCapitulos(caps, 'X')).toEqual([1, 2, 2, 2, 3])
  })

  it('un bloque que se llama como el libro y se parte en trozos no se pierde el primero', () => {
    const caps = [
      c('Diario de a bordo', 40),
      c('Diario de a bordo (parte 2 de 3)', 40),
      c('Diario de a bordo (parte 3 de 3)', 40),
    ]
    expect(numerarCapitulos(caps, 'Diario de a bordo')).toEqual([1, 1, 1])
    expect(sinTrozo('Diario de a bordo (parte 3 de 3)')).toBe('Diario de a bordo')
  })

  it('una sección larga que se llama como el libro es texto, no portadilla', () => {
    expect(numerarCapitulos([c('Mi informe', 45), c('Anexo técnico', 10)], 'Mi informe')).toEqual([1, null])
  })
})

describe('C12 · libro v1 sin reclasificar: el respaldo no falla', () => {
  it('sin capítulos, con un solo bloque y con páginas vacías', () => {
    expect(numerarCapitulos([], 'X')).toEqual([])
    expect(numerarCapitulos([{ titulo: 'Mi informe' }], 'Mi informe')).toEqual([1])
    // CF-17: sin ningún capítulo «real», las páginas vacías siguen sin número.
    expect(numerarCapitulos([c('Portadilla', 0), c('Créditos'), c('Índice')], 'X')).toEqual([null, 1, 2])
  })

  it('lo del final va sin número y en la región «después»', () => {
    const caps = [
      c('Capítulo 1'),
      c('Capítulo 2'),
      c('Notas', 1),
      c('Apéndice A', 2),
      c('Sobre la autora', 1),
      c('Colofón', 0),
    ]
    const l = estructurarIndice(caps, 'X')
    expect(l.map((x) => x.numero)).toEqual([1, 2, null, null, null, null])
    expect(l.map((x) => x.region)).toEqual(['cuerpo', 'cuerpo', 'despues', 'despues', 'despues', 'despues'])
  })

  it('lo de delante va en la región «antes»', () => {
    const l = estructurarIndice([c('Portadilla', 0), c('Créditos', 1), c('Capítulo 1')], 'X')
    expect(l.map((x) => x.region)).toEqual(['antes', 'antes', 'cuerpo'])
    expect(tieneEstructura([c('Capítulo 1')])).toBe(false)
  })

  it('con la forma REAL del DTO v1 (numero, region y tipo a null, presentes) también usa el respaldo', () => {
    // La API serializa los null (CapituloDTO v1): `numero !== undefined` daba v2 y se perdían los números.
    const v1 = (titulo: string, minutos = 5) => ({ titulo, minutos, numero: null, region: null, tipo: null })
    const caps = [v1('Dedicatoria', 1), v1('Capítulo 1'), v1('Capítulo 2'), v1('Notas', 1)]
    expect(tieneEstructura(caps)).toBe(false)
    const l = estructurarIndice(caps, 'X')
    expect(l.map((x) => x.numero)).toEqual([null, 1, 2, null])
    expect(l.map((x) => x.region)).toEqual(['antes', 'cuerpo', 'cuerpo', 'despues'])
  })
})

describe('C3 · con la estructura del taller (v2) manda la API', () => {
  it('usa numero, region y tipo tal cual, sin mirar los títulos', () => {
    const caps = [
      { titulo: 'Capítulo 1', minutos: 1, numero: null, region: 'antes' as const, tipo: 'publicidad' },
      { titulo: 'Primera parte', minutos: 0, numero: null, region: 'cuerpo' as const, tipo: 'parte' },
      { titulo: 'Uno', minutos: 9, numero: 1, region: 'cuerpo' as const, tipo: 'capitulo' },
      { titulo: 'Dos', minutos: 9, numero: 7, region: 'cuerpo' as const, tipo: 'capitulo' },
      { titulo: 'Notas', minutos: 2, numero: null, region: 'despues' as const, tipo: 'notas' },
    ]
    expect(tieneEstructura(caps)).toBe(true)
    expect(estructurarIndice(caps, 'X')).toEqual([
      { numero: null, region: 'antes', parte: false },
      { numero: null, region: 'cuerpo', parte: true },
      { numero: 1, region: 'cuerpo', parte: false },
      { numero: 7, region: 'cuerpo', parte: false },
      { numero: null, region: 'despues', parte: false },
    ])
  })

  it('una región desconocida o ausente cuenta como cuerpo', () => {
    expect(estructurarIndice([{ titulo: 'A', numero: 1, region: null }], 'X')[0].region).toBe('cuerpo')
  })
})
