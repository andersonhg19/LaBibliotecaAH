import {
  ALTO_FILA,
  ANCHO_COLUMNA,
  ANCHO_MAXIMO,
  ANCHO_MINIMO,
  ZOOM_MAX,
  ZOOM_MIN,
  acumulados,
  alineacionPorDefecto,
  altosDe,
  anchoAlContenido,
  anchosDe,
  avisoRecorte,
  buscar,
  celdaEn,
  clave,
  combinadaDe,
  combinadasQueTocan,
  desplazarPara,
  fijasDe,
  indexar,
  indiceEn,
  letraColumna,
  limitarZoom,
  nombreCelda,
  normalizarTexto,
  rangoVisible,
  siguienteZoom,
} from '@componentes/hoja/rejilla'
import { type HojaDeCalculo, type LibroDeHojas, MENSAJE_HOJA_INVALIDA, leerLibroDeHojas } from '@componentes/hoja/tipos'

const hoja = (p: Partial<HojaDeCalculo> = {}): HojaDeCalculo => ({
  nombre: 'Ventas',
  filas: 4,
  columnas: 3,
  filasOriginal: 4,
  columnasOriginal: 3,
  recortada: false,
  fijas: { filas: 1, columnas: 1 },
  anchos: [100, 50, 80],
  altos: [],
  celdas: [
    [0, 0, 'Fecha', 't', 1],
    [0, 1, 'Año', 't', 1],
    [1, 0, '12/11/2026', 'f', 0],
    [1, 1, '$ 1.234,50', 'n', 0],
    [3, 2, 'Canción de cuna', 't', 0],
  ],
  combinadas: [],
  estilos: [{}, { negrita: true }],
  ...p,
})

describe('nombres de columnas y celdas', () => {
  it('A..Z, AA, AZ, BA, ZZ, AAA', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(letraColumna)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
  it('B7 es la fila 6, columna 1', () => expect(nombreCelda(6, 1)).toBe('B7'))
  it('las claves no chocan entre filas y columnas', () => {
    expect(clave(1, 0)).not.toBe(clave(0, 1))
    expect(clave(1_048_575, 16_383)).toBe(1_048_575 * 65536 + 16_383)
  })
})

describe('medidas y zoom', () => {
  it('anchos: los del archivo, los arrastrados encima, y los límites', () => {
    expect(anchosDe(hoja())).toEqual([100, 50, 80])
    expect(anchosDe(hoja(), { 1: 200 })).toEqual([100, 200, 80])
    expect(anchosDe(hoja({ anchos: [0, 5, 5000] }))).toEqual([ANCHO_COLUMNA, ANCHO_MINIMO, ANCHO_MAXIMO])
    expect(anchosDe(hoja({ anchos: [] }))).toEqual([ANCHO_COLUMNA, ANCHO_COLUMNA, ANCHO_COLUMNA])
  })
  it('altos: el de por defecto y los propios dentro de la rejilla', () => {
    expect(
      altosDe(
        hoja({
          altos: [
            [0, 40],
            [9, 80],
          ],
        }),
      ),
    ).toEqual([40, ALTO_FILA, ALTO_FILA, ALTO_FILA])
  })
  it('acumulados con zoom', () => {
    expect(Array.from(acumulados([100, 50, 80]))).toEqual([0, 100, 150, 230])
    expect(Array.from(acumulados([100, 50], 0.5))).toEqual([0, 50, 75])
    expect(Array.from(acumulados([]))).toEqual([0])
  })
  it('el zoom sube y baja por escalones y no se sale', () => {
    expect(siguienteZoom(1, 1)).toBe(1.1)
    expect(siguienteZoom(1, -1)).toBe(0.9)
    expect(siguienteZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(siguienteZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
    expect(siguienteZoom(1.05, 1)).toBe(1.1)
    expect(limitarZoom(9)).toBe(ZOOM_MAX)
    expect(limitarZoom(0.1)).toBe(ZOOM_MIN)
  })
})

describe('qué se ve', () => {
  const pos = acumulados([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
  it('búsqueda binaria del tramo, con los bordes', () => {
    expect(indiceEn(pos, -5)).toBe(0)
    expect(indiceEn(pos, 0)).toBe(0)
    expect(indiceEn(pos, 9.99)).toBe(0)
    expect(indiceEn(pos, 10)).toBe(1)
    expect(indiceEn(pos, 99)).toBe(9)
    expect(indiceEn(pos, 1000)).toBe(9)
    expect(indiceEn(acumulados([]), 5)).toBe(0)
  })
  it('rango visible desde lo fijo, con margen y sin salirse', () => {
    expect(rangoVisible(pos, 1, 0, 30, 0)).toEqual({ inicio: 1, fin: 3 })
    expect(rangoVisible(pos, 1, 25, 30, 1)).toEqual({ inicio: 2, fin: 7 })
    expect(rangoVisible(pos, 1, 500, 30, 2)).toEqual({ inicio: 7, fin: 9 })
    expect(rangoVisible(pos, 0, 0, 1000, 3)).toEqual({ inicio: 0, fin: 9 })
  })
  it('una hoja 1×1 y una zona fija que lo ocupa todo dan rangos vacíos sin romperse', () => {
    const uno = acumulados([24])
    expect(rangoVisible(uno, 0, 0, 300)).toEqual({ inicio: 0, fin: 0 })
    const r = rangoVisible(uno, 1, 0, 300)
    expect(r.fin).toBeLessThan(r.inicio)
    expect(rangoVisible(pos, 0, 0, 0).fin).toBeLessThan(0)
  })
  it('con zoom caben más filas al alejar', () => {
    const lejos = rangoVisible(acumulados(new Array(100).fill(24), 0.5), 0, 0, 240, 0)
    const cerca = rangoVisible(acumulados(new Array(100).fill(24), 2), 0, 0, 240, 0)
    expect(lejos.fin).toBe(19)
    expect(cerca.fin).toBe(4)
  })
  it('lo inmovilizado nunca es toda la hoja y tiene tope', () => {
    expect(fijasDe(hoja())).toEqual({ filas: 1, columnas: 1 })
    expect(fijasDe(hoja({ fijas: { filas: 50, columnas: 50 } }))).toEqual({ filas: 3, columnas: 2 })
    expect(fijasDe(hoja({ filas: 1, columnas: 1, fijas: { filas: 1, columnas: 1 } }))).toEqual({
      filas: 0,
      columnas: 0,
    })
  })
})

describe('índice de la hoja y combinadas', () => {
  it('indexa por fila y columna e ignora lo que cae fuera de la rejilla', () => {
    const ind = indexar(hoja({ celdas: [...hoja().celdas, [10, 0, 'fuera', 't', 0]] }))
    expect(celdaEn(ind, 1, 1)?.[2]).toBe('$ 1.234,50')
    expect(celdaEn(ind, 2, 2)).toBeUndefined()
    expect(ind.porFila.has(10)).toBe(false)
  })
  it('una combinada tapa sus celdas, se recorta al borde y las de una celda se ignoran', () => {
    const ind = indexar(
      hoja({
        combinadas: [
          [0, 1, 0, 9],
          [2, 2, 2, 2],
          [3, 0, 2, 0],
        ],
      }),
    )
    expect(ind.combinadas).toEqual([
      { f1: 0, c1: 1, f2: 0, c2: 2 },
      { f1: 2, c1: 0, f2: 3, c2: 0 },
    ])
    expect(ind.tapadas.has(clave(0, 2))).toBe(true)
    expect(ind.tapadas.has(clave(2, 2))).toBe(false)
    expect(combinadaDe(ind, 3, 0)).toEqual({ f1: 2, c1: 0, f2: 3, c2: 0 })
    expect(combinadaDe(ind, 1, 1)).toBeNull()
  })
  it('combinadas que tocan la vista aunque su ancla quede fuera', () => {
    const ind = indexar(hoja({ filas: 20, columnas: 10, combinadas: [[0, 0, 9, 3]] }))
    expect(combinadasQueTocan(ind, { inicio: 5, fin: 8 }, { inicio: 2, fin: 6 })).toHaveLength(1)
    expect(combinadasQueTocan(ind, { inicio: 10, fin: 12 }, { inicio: 0, fin: 6 })).toHaveLength(0)
    expect(combinadasQueTocan(ind, { inicio: 1, fin: 0 }, { inicio: 0, fin: 6 })).toHaveLength(0)
  })
  it('una combinada que se solapa con otra ya tomada no se cuenta dos veces', () => {
    const ind = indexar(
      hoja({
        combinadas: [
          [0, 0, 1, 1],
          [0, 0, 0, 2],
        ],
      }),
    )
    expect(ind.combinadas).toHaveLength(1)
  })
})

describe('búsqueda', () => {
  const libro: LibroDeHojas = {
    versionFormato: 1,
    recortado: false,
    hojas: [
      hoja(),
      hoja({
        nombre: 'Resumen',
        celdas: [
          [2, 1, 'CANCION', 't', 0],
          [0, 0, 'cancion', 't', 0],
        ],
      }),
    ],
  }
  it('sin tildes ni mayúsculas, hoja por hoja y en orden fila → columna', () => {
    expect(buscar(libro, '  Canción ')).toEqual([
      { hoja: 0, fila: 3, columna: 2 },
      { hoja: 1, fila: 0, columna: 0 },
      { hoja: 1, fila: 2, columna: 1 },
    ])
    expect(buscar(libro, 'año')).toEqual([{ hoja: 0, fila: 0, columna: 1 }])
    expect(buscar(libro, '1.234')).toEqual([{ hoja: 0, fila: 1, columna: 1 }])
  })
  it('una búsqueda vacía no devuelve nada y la caché se reutiliza', () => {
    expect(buscar(libro, '   ')).toEqual([])
    const cache = new WeakMap()
    buscar(libro, 'fecha', cache)
    expect(cache.get(libro.hojas[0])).toHaveLength(5)
    expect(buscar(libro, 'FECHA', cache)).toEqual([{ hoja: 0, fila: 0, columna: 0 }])
  })
  it('normaliza espacios y tildes', () => expect(normalizarTexto('Año   FÍSCAL')).toBe('ano fiscal'))
})

describe('ajustes y desplazamiento', () => {
  it('ancho al contenido: según el texto más largo, con límites', () => {
    const h = hoja()
    const ind = indexar(h)
    expect(anchoAlContenido(h, ind, 2)).toBeGreaterThan(anchoAlContenido(h, ind, 0))
    const largo = hoja({ celdas: [[0, 0, 'x'.repeat(500), 't', 0]] })
    expect(anchoAlContenido(largo, indexar(largo), 0)).toBe(ANCHO_MAXIMO)
    const vacia = hoja({ columnas: 4 })
    expect(anchoAlContenido(vacia, indexar(vacia), 3)).toBe(40)
  })
  it('desplaza lo justo para ver la celda fuera de lo fijo', () => {
    const posX = acumulados(new Array(20).fill(100))
    const posY = acumulados(new Array(100).fill(20))
    const fijas = { filas: 1, columnas: 1 }
    const vista = { x: 0, y: 0, ancho: 300, alto: 200 }
    expect(desplazarPara(posX, posY, fijas, 50, 10, vista)).toEqual({ x: 700, y: 800 })
    expect(desplazarPara(posX, posY, fijas, 2, 2, { ...vista, x: 700, y: 800 })).toEqual({ x: 100, y: 20 })
    expect(desplazarPara(posX, posY, fijas, 0, 0, { ...vista, x: 55, y: 66 })).toEqual({ x: 55, y: 66 })
    expect(desplazarPara(posX, posY, fijas, 3, 2, vista)).toEqual({ x: 0, y: 0 })
  })
  it('una celda más ancha que la vista se alinea por su inicio', () => {
    const posX = acumulados([100, 900, 100])
    const posY = acumulados([20, 20])
    expect(desplazarPara(posX, posY, { filas: 0, columnas: 0 }, 0, 1, { x: 0, y: 0, ancho: 300, alto: 100 }).x).toBe(
      100,
    )
  })
  it('alineación por defecto según el tipo', () => {
    expect(['t', 'n', 'f', 'b', 'e'].map((t) => alineacionPorDefecto(t as 't'))).toEqual([
      'izquierda',
      'derecha',
      'derecha',
      'centro',
      'centro',
    ])
  })
})

describe('aviso de recorte', () => {
  it('nada si la hoja está entera', () => expect(avisoRecorte(hoja())).toBeNull())
  it('filas, columnas o las dos', () => {
    expect(avisoRecorte(hoja({ recortada: true, filas: 5000, filasOriginal: 12000 }))).toBe(
      'Se muestran las primeras 5.000 filas de 12.000.',
    )
    expect(avisoRecorte(hoja({ recortada: true, columnasOriginal: 300 }))).toBe(
      'Se muestran las primeras 3 columnas de 300.',
    )
    expect(avisoRecorte(hoja({ recortada: true }))).toBe('La hoja es muy grande: se muestra solo una parte.')
  })
})

describe('esquema de hoja.json', () => {
  const valido = { versionFormato: 1, recortado: false, hojas: [hoja()] }
  it('acepta un libro válido', () => {
    const r = leerLibroDeHojas(JSON.parse(JSON.stringify(valido)))
    expect('libro' in r && r.libro.hojas[0].nombre).toBe('Ventas')
  })
  it('rechaza otra versión, tipos de celda desconocidos, colores raros y libros sin hojas', () => {
    const espia = jest.spyOn(console, 'warn').mockImplementation(() => {})
    for (const malo of [
      { ...valido, versionFormato: 2 },
      { ...valido, hojas: [] },
      { ...valido, hojas: [hoja({ celdas: [[0, 0, 'x', 'z' as 't', 0]] })] },
      { ...valido, hojas: [hoja({ estilos: [{ fondo: 'red' }] })] },
      null,
      'texto',
    ]) {
      expect(leerLibroDeHojas(malo)).toEqual({ error: MENSAJE_HOJA_INVALIDA })
    }
    espia.mockRestore()
  })
})
