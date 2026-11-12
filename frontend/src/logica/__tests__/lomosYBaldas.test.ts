import {
  PREFERENCIAS_INICIALES,
  SIN_AUTOR,
  SIN_GENERO,
  agruparLibros,
  claveEstanteria,
  leerPreferenciasEstanteria,
  normalizar,
} from '@logica/agrupar'
import {
  ALTO_MAX,
  ALTO_MIN,
  GROSOR_MAX,
  GROSOR_MIN,
  TAM_TITULO_MAX,
  TAM_TITULO_MIN,
  apellidosParaLomo,
  componerTitulo,
  grosorUtil,
  largoUtil,
  medirEstimado,
  textoDelLomo,
} from '@logica/lomos'
import type { EjemplarDTO } from '@tipos'

/**
 * ============================================================================
 * LOS LOMOS SE LEEN EN EL TELÉFONO, Y LAS BALDAS SE AGRUPAN POR TIPO
 * ============================================================================
 * Anderson, en su iPhone, veía "Maxw…", "Guin", "Riord…" pegados abajo del lomo
 * y ningún título. Estas pruebas fijan cómo se compone el texto de un lomo
 * (tamaño, líneas, cortes por palabra, autor solo si cabe entero) y cómo se
 * reparten los libros en baldas por género o por autor.
 */

const TITULOS = [
  'It',
  'Rayuela',
  'El principito',
  'Cien años de soledad',
  'La guía del autoestopista galáctico',
  'Percy Jackson y el ladrón del rayo',
  'Las 21 leyes irrefutables del liderazgo',
  'El ingenioso hidalgo don Quijote de la Mancha',
  'Crónica de una muerte anunciada',
]
const MEDIDAS = [
  { alto: ALTO_MIN, grosor: GROSOR_MIN },
  { alto: ALTO_MIN, grosor: GROSOR_MAX },
  { alto: ALTO_MAX, grosor: GROSOR_MIN },
  { alto: ALTO_MAX, grosor: GROSOR_MAX },
  { alto: 200, grosor: 52 },
]

describe('El título del lomo', () => {
  it.each(MEDIDAS)('en un lomo de %o: tamaño entre 14 y 20, y cada línea cabe en el largo útil', (m) => {
    for (const t of TITULOS) {
      const r = componerTitulo(t, largoUtil(m.alto), grosorUtil(m.grosor))
      expect(r.tam).toBeGreaterThanOrEqual(TAM_TITULO_MIN)
      expect(r.tam).toBeLessThanOrEqual(TAM_TITULO_MAX)
      expect(r.lineas.length).toBeGreaterThanOrEqual(1)
      expect(r.lineas.length).toBeLessThanOrEqual(2)
      r.lineas.forEach((l) => expect(medirEstimado(l, r.tam, 'titulo')).toBeLessThanOrEqual(largoUtil(m.alto)))
      /* Las líneas, apiladas, caben en el grosor. */
      expect(r.lineas.length * r.alturaLinea).toBeLessThanOrEqual(grosorUtil(m.grosor) + 0.01)
    }
  })

  it('un título corto va en una línea y al tamaño mayor', () => {
    expect(componerTitulo('It', 128, 32)).toEqual(expect.objectContaining({ lineas: ['It'], tam: 20, completo: true }))
    expect(componerTitulo('Rayuela', 128, 32).lineas).toEqual(['Rayuela'])
  })

  it('el mismo título se agranda en un lomo más largo', () => {
    const corto = componerTitulo('La sombra del viento', largoUtil(ALTO_MIN), grosorUtil(GROSOR_MIN))
    const largo = componerTitulo('La sombra del viento', largoUtil(ALTO_MAX), grosorUtil(GROSOR_MIN))
    expect(largo.tam).toBeGreaterThanOrEqual(corto.tam)
  })

  it('el lomo más fino (40 px) admite DOS líneas a 14 px: «Cien años de soledad» cabe entero', () => {
    const r = componerTitulo('Cien años de soledad', largoUtil(ALTO_MIN), grosorUtil(GROSOR_MIN))
    expect(r.completo).toBe(true)
    expect(r.lineas.join(' ')).toBe('Cien años de soledad')
  })

  it('un lomo demasiado fino para dos líneas usa una sola', () => {
    const r = componerTitulo('Percy Jackson y el ladrón del rayo', 128, 20)
    expect(r.lineas).toHaveLength(1)
  })

  it('parte por palabras, en líneas parejas y sin dejar un «y» o un «de» colgando', () => {
    const r = componerTitulo('Percy Jackson y el ladrón del rayo', largoUtil(ALTO_MIN), grosorUtil(GROSOR_MAX))
    expect(r.completo).toBe(true)
    expect(r.lineas).toHaveLength(2)
    expect(r.lineas.join(' ')).toBe('Percy Jackson y el ladrón del rayo')
    expect(r.lineas[0]).not.toMatch(/\s(y|de|del|el|la)$/i)
  })

  it('prefiere partir tras un punto: «Sapiens.» / «De animales a dioses»', () => {
    const r = componerTitulo('Sapiens. De animales a dioses', largoUtil(ALTO_MAX), grosorUtil(GROSOR_MAX))
    expect(r.lineas[0]).toBe('Sapiens.')
  })

  it('si no cabe ni a 14 px, corta tras la última palabra entera con «…» (nunca a mitad de palabra)', () => {
    const titulo = 'El ingenioso hidalgo don Quijote de la Mancha y otras historias de caballeros andantes'
    const r = componerTitulo(titulo, largoUtil(ALTO_MIN), grosorUtil(GROSOR_MIN))
    expect(r.completo).toBe(false)
    expect(r.tam).toBe(TAM_TITULO_MIN)
    const ultima = r.lineas[r.lineas.length - 1]
    expect(ultima.endsWith('…')).toBe(true)
    const palabras = titulo.split(' ')
    r.lineas
      .join(' ')
      .replace('…', '')
      .split(' ')
      .filter(Boolean)
      .forEach((p) => expect(palabras).toContain(p))
    /* Sin palabra débil justo antes del corte. */
    expect(ultima).not.toMatch(/\s(de|la|y|el|del)…$/i)
  })

  it('solo una palabra más larga que el lomo se corta a mitad, con «…»', () => {
    const r = componerTitulo('Supercalifragilísticoespialidoso', 80, 32)
    expect(r.completo).toBe(false)
    expect(r.lineas).toHaveLength(1)
    expect(r.lineas[0]).toMatch(/^Supercali.*…$/)
    expect(medirEstimado(r.lineas[0], r.tam, 'titulo')).toBeLessThanOrEqual(80)
  })

  it('un título vacío no rompe nada', () => {
    expect(componerTitulo('   ', 128, 32).lineas).toEqual([''])
  })
})

describe('El autor del lomo: entero o nada', () => {
  const libro = (titulo: string, autor: string) => ({ titulo, autores: [autor] })

  it('nunca va cortado: o es un apellido completo o no aparece', () => {
    const autores = [
      'John C. Maxwell',
      'Ursula K. Le Guin',
      'Rick Riordan',
      'Gabriel García Márquez',
      'Yuval Noah Harari',
    ]
    for (const m of MEDIDAS)
      for (const t of TITULOS)
        for (const a of autores) {
          const r = textoDelLomo(libro(t, a), m)
          if (r.autor) {
            expect(r.autor).not.toContain('…')
            expect(apellidosParaLomo(a)).toContain(r.autor)
          }
        }
  })

  it('en un lomo gordo con título corto, el autor sí va', () => {
    expect(textoDelLomo(libro('Ficciones', 'Jorge Luis Borges'), { alto: 200, grosor: 56 }).autor).toBe('Borges')
  })

  it('con un título largo que llena el lomo, el autor se quita antes que encoger o cortar el título', () => {
    const r = textoDelLomo(libro('Las 21 leyes irrefutables del liderazgo', 'John C. Maxwell'), {
      alto: ALTO_MIN,
      grosor: GROSOR_MIN,
    })
    expect(r.autor).toBeNull()
  })

  it('poner el autor no deja el título por debajo de 16 px si solo cabía más grande', () => {
    for (const m of MEDIDAS)
      for (const t of TITULOS) {
        const solo = componerTitulo(t, largoUtil(m.alto), grosorUtil(m.grosor))
        const r = textoDelLomo(libro(t, 'Rick Riordan'), m)
        if (r.autor) {
          expect(r.completo).toBe(true)
          expect(r.tam).toBeGreaterThanOrEqual(Math.min(solo.tam, 16))
        }
      }
  })

  it('sin autores, sin autor', () => {
    expect(textoDelLomo({ titulo: 'It', autores: [] }, { alto: 200, grosor: 60 }).autor).toBeNull()
  })
})

describe('El apellido que va en el lomo', () => {
  it.each([
    ['Rick Riordan', ['Riordan']],
    ['John C. Maxwell', ['Maxwell']],
    ['J. K. Rowling', ['Rowling']],
    ['Ursula K. Le Guin', ['Le Guin']],
    ['Jorge Luis Borges', ['Borges']],
    ['Yuval Noah Harari', ['Harari']],
    ['Gabriel García Márquez', ['García Márquez', 'García']],
    ['Carlos Ruiz Zafón', ['Ruiz Zafón', 'Ruiz']],
    ['Miguel de Cervantes Saavedra', ['Cervantes Saavedra', 'Cervantes']],
    ['Antoine de Saint-Exupéry', ['Saint-Exupéry']],
    ['Pedro Calderón de la Barca', ['Calderón de la Barca', 'Calderón']],
    ['Sun Tzu', ['Tzu']],
    ['Anónimo', ['Anónimo']],
    ['', []],
  ])('%s → %o', (autor, esperado) => expect(apellidosParaLomo(autor)).toEqual(esperado))
})

const ej = (id: string, titulo: string, generos: string[], autores: string[] = []): EjemplarDTO =>
  ({ id, titulo, generos, autores, tipo: 'LIBRO' }) as unknown as EjemplarDTO

describe('Las baldas por género y por autor', () => {
  const libros = [
    ej('1', 'Cien años de soledad', ['Realismo mágico', 'Novela'], ['Gabriel García Márquez']),
    ej('2', 'Crónica de una muerte anunciada', ['Realismo mágico'], ['Gabriel García Márquez']),
    ej('3', 'Rayuela', ['Novela'], ['Julio Cortázar']),
    ej('4', 'El arbol de la ciencia', ['novela '], ['Pío Baroja']),
    ej('5', 'El arte de la guerra', [], ['Sun Tzu']),
    ej('6', 'Buenos presagios', ['Fantasía', 'Humor'], ['Terry Pratchett', 'Neil Gaiman']),
    ej('7', 'Anónimo total', ['Fantasía'], []),
  ]

  it('por cantidad: la balda más llena primero, y «Sin género» al final', () => {
    const g = agruparLibros(libros, 'GENERO', 'CANTIDAD')
    expect(g.map((x) => [x.nombre, x.libros.length])).toEqual([
      ['Novela', 3],
      ['Fantasía', 2],
      ['Realismo mágico', 2],
      ['Humor', 1],
      [SIN_GENERO, 1],
    ])
    expect(g[g.length - 1].resto).toBe(true)
  })

  it('alfabéticamente, sin importar tildes ni mayúsculas', () => {
    expect(agruparLibros(libros, 'GENERO', 'ALFABETICO').map((x) => x.nombre)).toEqual([
      'Fantasía',
      'Humor',
      'Novela',
      'Realismo mágico',
      SIN_GENERO,
    ])
  })

  it('un libro de dos géneros (o dos autores) está en las dos baldas, una sola vez en cada una', () => {
    const g = agruparLibros(libros, 'AUTOR', 'CANTIDAD')
    expect(g.find((x) => x.nombre === 'Terry Pratchett')?.libros.map((l) => l.id)).toEqual(['6'])
    expect(g.find((x) => x.nombre === 'Neil Gaiman')?.libros.map((l) => l.id)).toEqual(['6'])
    expect(g[0]).toEqual(expect.objectContaining({ nombre: 'Gabriel García Márquez' }))
    expect(g[g.length - 1].nombre).toBe(SIN_AUTOR)
  })

  it('dentro de cada balda, los libros por título', () => {
    const novela = agruparLibros(libros, 'GENERO', 'CANTIDAD')[0]
    expect(novela.libros.map((l) => l.titulo)).toEqual(['Cien años de soledad', 'El arbol de la ciencia', 'Rayuela'])
  })

  it('filtrando por un género, solo sale su balda (sin «Sin género»)', () => {
    const g = agruparLibros(libros, 'GENERO', 'CANTIDAD', ['Novela'])
    expect(g.map((x) => x.nombre)).toEqual(['Novela'])
  })

  it('sin libros, sin baldas', () => expect(agruparLibros([], 'AUTOR', 'CANTIDAD')).toEqual([]))

  it('normaliza tildes, mayúsculas y espacios', () => expect(normalizar('  García   MÁRQUEZ ')).toBe('garcia marquez'))
})

describe('Lo que se recuerda de la estantería', () => {
  it('por usuario', () => expect(claveEstanteria('7')).not.toBe(claveEstanteria('8')))

  it('lee lo guardado y deja solo autores, géneros y formatos', () => {
    const p = leerPreferenciasEstanteria(
      JSON.stringify({
        agrupar: 'AUTOR',
        orden: 'ALFABETICO',
        filtros: { autores: ['Borges'], generos: ['Cuento'], formatos: ['EPUB'], conNotas: true, pestana: 'LEIDOS' },
      }),
    )
    expect(p.agrupar).toBe('AUTOR')
    expect(p.orden).toBe('ALFABETICO')
    expect(p.filtros.autores).toEqual(['Borges'])
    expect(p.filtros.generos).toEqual(['Cuento'])
    expect(p.filtros.formatos).toEqual(['EPUB'])
    expect(p.filtros.conNotas).toBe(false)
    expect(p.filtros.pestana).toBe('TODO')
  })

  it.each([null, '', 'no es json', '[]', '{"agrupar":"PISOS","orden":7,"filtros":{"autores":"x"}}'])(
    'algo viejo o roto (%p) cae a lo inicial',
    (g) => {
      const p = leerPreferenciasEstanteria(g)
      expect(p.agrupar).toBe(PREFERENCIAS_INICIALES.agrupar)
      expect(p.orden).toBe(PREFERENCIAS_INICIALES.orden)
      expect(p.filtros.autores).toEqual([])
    },
  )
})
