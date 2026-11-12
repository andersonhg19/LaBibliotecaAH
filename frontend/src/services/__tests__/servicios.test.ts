import { validarEntorno } from '@config/entorno'
import api from '@servicios/api'
import { urlBinaria, urlLibro, urlMuestraVoz, urlPortada } from '@servicios/archivos'
import {
  anotacionesService,
  audioService,
  comentariosService,
  estantesService,
  librosService,
  progresoService,
  vocesService,
} from '@servicios/bibliotecaService'
import { consultar, facetas } from '@servicios/mock/consulta'
import { librosIniciales } from '@servicios/mock/datos'

jest.mock('@servicios/api', () => {
  const real = jest.requireActual('@servicios/api')
  return {
    __esModule: true,
    ...real,
    default: { post: jest.fn(async () => ({ data: { correct: true, message: 'OK', errorCode: 0, object: null } })) },
  }
})

const post = api.post as jest.Mock
const B = '/BIBLIOTECA-SERVICE/biblioteca/v1'

describe('La API de biblioteca-service sigue el contrato (§9)', () => {
  beforeEach(() => post.mockClear())

  it.each([
    ['libros/all', () => librosService.todos({ pestana: 'LEYENDO' }), `${B}/libros/all`, { pestana: 'LEYENDO' }],
    ['libros/get', () => librosService.detalle('e 1'), `${B}/libros/get/e%201`, undefined],
    [
      'libros/save',
      () => librosService.guardar({ id: 'e1', favorito: true }),
      `${B}/libros/save`,
      { id: 'e1', favorito: true },
    ],
    ['libros/delete', () => librosService.borrar('e1'), `${B}/libros/delete/e1`, undefined],
    ['libros/facetas', () => librosService.facetas(), `${B}/libros/facetas`, undefined],
    [
      'libros/deseo',
      () => librosService.deseo({ titulo: 'T', autor: 'A' }),
      `${B}/libros/deseo`,
      { titulo: 'T', autor: 'A' },
    ],
    ['progreso/get', () => progresoService.obtener('e1'), `${B}/progreso/get/e1`, undefined],
    ['anotaciones/all', () => anotacionesService.todas('e1'), `${B}/anotaciones/all/e1`, undefined],
    ['anotaciones/delete', () => anotacionesService.borrar('a1'), `${B}/anotaciones/delete/a1`, undefined],
    [
      'comentarios/save',
      () => comentariosService.guardar({ ejemplarId: 'e1', texto: 'x' }),
      `${B}/comentarios/save`,
      { ejemplarId: 'e1', texto: 'x' },
    ],
    ['estantes/all', () => estantesService.todos(), `${B}/estantes/all`, undefined],
    ['estantes/libros', () => estantesService.libros('f'), `${B}/estantes/f/libros`, undefined],
    ['estantes/agregar', () => estantesService.agregar('f', 'e1'), `${B}/estantes/f/agregar`, { ejemplarId: 'e1' }],
    [
      'estantes/ordenar',
      () => estantesService.ordenar('f', { ejemplarId: 'e1', despuesDe: 'e0' }),
      `${B}/estantes/f/ordenar`,
      { ejemplarId: 'e1', despuesDe: 'e0' },
    ],
    ['voces/all', () => vocesService.todas(), `${B}/voces/all`, undefined],
    [
      'audio/estado',
      () => audioService.estado({ ejemplarId: 'e1', vozId: 'v', capitulo: 2 }),
      `${B}/audio/estado`,
      { ejemplarId: 'e1', vozId: 'v', capitulo: 2 },
    ],
  ])('%s', async (_n, llamar, ruta, cuerpo) => {
    await llamar()
    expect(post).toHaveBeenCalledWith(ruta, cuerpo)
  })

  it('ningún cuerpo lleva userId (la identidad sale del token)', async () => {
    await librosService.todos({})
    await progresoService.guardar({
      ejemplarId: 'e',
      capitulo: 0,
      fraseId: null,
      cfi: null,
      posicionAudioSeg: null,
      vozId: null,
      velocidad: null,
      porcentaje: 0,
      modo: 'VISTA',
      dispositivo: null,
      actualizadoEn: '',
    })
    for (const [, cuerpo] of post.mock.calls) expect(JSON.stringify(cuerpo ?? {})).not.toMatch(/userId/i)
  })

  it('subir manda multipart con el campo archivos y el tipo, y reporta el progreso', async () => {
    const avances: number[] = []
    post.mockImplementationOnce(
      async (
        _r: string,
        datos: FormData,
        cfg: { onUploadProgress: (e: { loaded: number; total: number }) => void },
      ) => {
        cfg.onUploadProgress({ loaded: 50, total: 100 })
        expect(datos.get('tipo')).toBe('DOCUMENTO')
        return { data: { correct: true, message: 'OK', errorCode: 0, object: [] } }
      },
    )
    await librosService.subir(new Blob(['x']) as Blob & { name: string }, 'DOCUMENTO', (p) => avances.push(p))
    expect(post.mock.calls[0][0]).toBe(`${B}/libros/subir`)
    expect(avances).toEqual([0.5])
  })
})

describe('Las URL de los binarios llevan el token en ?t=', () => {
  it('normaliza las rutas que da el servidor', () => {
    expect(urlBinaria('/v1/archivos/a/audio/v/cap-000.m4a', 'TOK')).toBe(
      'http://localhost:9920/BIBLIOTECA-SERVICE/biblioteca/v1/archivos/a/audio/v/cap-000.m4a?t=TOK',
    )
    expect(urlBinaria('/BIBLIOTECA-SERVICE/biblioteca/v1/x?y=1', 'TOK')).toBe(
      'http://localhost:9920/BIBLIOTECA-SERVICE/biblioteca/v1/x?y=1&t=TOK',
    )
    expect(urlBinaria('/biblioteca/v1/x', 'TOK')).toBe('http://localhost:9920/BIBLIOTECA-SERVICE/biblioteca/v1/x?t=TOK')
    expect(urlBinaria('https://otro/x?t=YA', 'TOK')).toBe('https://otro/x?t=YA')
    expect(urlBinaria(null, 'TOK')).toBeNull()
  })
  it('libro, portada y muestra', () => {
    expect(urlLibro('a b')).toContain('/archivos/a%20b/libro.epub')
    expect(urlPortada('a')).toContain('/archivos/a/portada.jpg')
    expect(urlMuestraVoz('edge.es-ES-AlvaroNeural')).toContain('/voces/edge.es-ES-AlvaroNeural/muestra.mp3')
  })
})

describe('El entorno se valida al arrancar', () => {
  it('valores por defecto', () =>
    expect(validarEntorno({})).toEqual({ EXPO_PUBLIC_API_URL: 'http://localhost:9920', EXPO_PUBLIC_MOCK: false }))
  it('modo demostración y barra final', () =>
    expect(validarEntorno({ EXPO_PUBLIC_API_URL: 'https://casa:7051/', EXPO_PUBLIC_MOCK: '1' })).toEqual({
      EXPO_PUBLIC_API_URL: 'https://casa:7051',
      EXPO_PUBLIC_MOCK: true,
    }))
  it('una URL mal escrita falla con un mensaje claro', () =>
    expect(() => validarEntorno({ EXPO_PUBLIC_API_URL: 'casa:7051' })).toThrow(
      /EXPO_PUBLIC_API_URL debe ser una URL completa/,
    ))
})

describe('La API simulada filtra y ordena como el servidor', () => {
  const libros = librosIniciales()
  it('pestañas', () => {
    expect(consultar(libros, { pestana: 'DESEOS' }).list.every((l) => l.tipo === 'DESEO')).toBe(true)
    expect(consultar(libros, { pestana: 'DOCUMENTOS' }).list.every((l) => l.tipo === 'DOCUMENTO')).toBe(true)
    expect(
      consultar(libros, { pestana: 'LEYENDO' }).list.every((l) => l.estado === 'LEYENDO' && l.tipo === 'LIBRO'),
    ).toBe(true)
  })
  it('recientes primero por fecha de llegada', () => {
    const l = consultar(libros, { orden: 'RECIENTES', size: 100 }).list
    for (let i = 1; i < l.length; i++)
      expect(Date.parse(l[i - 1].fechaLlegada)).toBeGreaterThanOrEqual(Date.parse(l[i].fechaLlegada))
  })
  it('texto sin tildes, autor, año y paginación', () => {
    expect(consultar(libros, { texto: 'galdos' }).list.length).toBeGreaterThanOrEqual(3)
    expect(consultar(libros, { autores: ['Miguel de Unamuno'], pestana: 'TODO' }).list.map((l) => l.titulo)).toContain(
      'Niebla',
    )
    expect(
      consultar(libros, { anioDesde: 1600, anioHasta: 1700 }).list.every(
        (l) => (l.anio ?? 0) >= 1600 && (l.anio ?? 0) <= 1700,
      ),
    ).toBe(true)
    const p = consultar(libros, { size: 5, page: 1 })
    expect(p.list).toHaveLength(5)
    expect(p.totalPage).toBe(Math.ceil(libros.length / 5))
  })
  it('facetas con su cuenta', () => {
    const f = facetas(libros)
    expect(f.autores.find((a) => a.nombre === 'Benito Pérez Galdós')?.n).toBe(4)
    expect(f.formatos.map((x) => x.nombre)).toEqual(expect.arrayContaining(['EPUB', 'PDF']))
  })
})
