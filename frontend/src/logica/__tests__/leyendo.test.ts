import {
  OPCIONES_QUITAR,
  REGISTRO_INICIAL,
  alEntrarEnLeyendo,
  capituloDeProgreso,
  conCopia,
  esSoloRegistro,
  etiquetaSinConexion,
  leerAutores,
  leerFecha,
  sincronizarLeyendo,
  tamanoLegible,
  textoSinConexion,
  validarRegistro,
} from '@logica/leyendo'
import { librosService, preparacionService } from '@servicios/bibliotecaService'
import { librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO } from '@tipos'
import { type ProgresoSinConexion, guardarSinConexion, sincronizarSinConexion } from '@utils/sinConexion'

/*
 * 0.5.0 · «LEYENDO» MANDA (C10) y LIBROS «SOLO REGISTRO» (C11): la lógica
 * pura y lo que se pide en segundo plano. `sinConexion` es el contrato con la
 * ola de voz: aquí se simula.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@utils/sinConexion')

const ok = <T>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBROS = librosIniciales()
const porId = (id: string) => LIBROS.find((l) => l.id === id) as EjemplarDTO
const mLibros = librosService as jest.Mocked<typeof librosService>
const mPrep = preparacionService as jest.Mocked<typeof preparacionService>
const mSincronizar = sincronizarSinConexion as jest.MockedFunction<typeof sincronizarSinConexion>
const mGuardar = guardarSinConexion as jest.MockedFunction<typeof guardarSinConexion>
const p = (o: Partial<ProgresoSinConexion>): ProgresoSinConexion => ({
  ejemplarId: 'x',
  estado: 'ninguno',
  total: 0,
  guardados: 0,
  bytes: 0,
  mensaje: '',
  ...o,
})
/** Deja correr las promesas de segundo plano. */
const vaciar = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  jest.clearAllMocks()
  mPrep.preparar.mockResolvedValue(ok(true))
})

describe('C11 · qué es un libro «solo registro»', () => {
  it('sin archivo y libro → sí; un deseo (que tampoco tiene archivo) → no; sin el campo → no', () => {
    expect(esSoloRegistro({ tipo: 'LIBRO', sinArchivo: true })).toBe(true)
    expect(esSoloRegistro({ tipo: 'DESEO', sinArchivo: true })).toBe(false)
    expect(esSoloRegistro({ tipo: 'DOCUMENTO', sinArchivo: true })).toBe(false)
    expect(esSoloRegistro({ tipo: 'LIBRO' })).toBe(false)
  })
  it('a la copia sin conexión solo van libros con archivo', () => {
    const lista = [porId('ej-guardian'), { ...porId('ej-quijote'), sinArchivo: true }, porId('ej-doc-notas')]
    expect(conCopia(lista).map((l) => l.id)).toEqual(['ej-guardian'])
  })
})

describe('C10.4 · las tres salidas de «Leyendo»', () => {
  it('Lo dejo para después → Por leer; Lo abandoné → Abandonado; Ya lo terminé → Leído', () => {
    expect(OPCIONES_QUITAR.map((o) => [o.titulo, o.estado])).toEqual([
      ['Lo dejo para después', 'POR_LEER'],
      ['Lo abandoné', 'ABANDONADO'],
      ['Ya lo terminé', 'LEIDO'],
    ])
  })
})

describe('C12 · la marca discreta de la copia sin conexión', () => {
  it('completo → «Sin conexión ✓»; bajando → «Guardando 12/40»; nada, error o no disponible → no se enseña', () => {
    expect(textoSinConexion(p({ estado: 'completo', total: 40, guardados: 40 }))).toBe('Sin conexión ✓')
    expect(textoSinConexion(p({ estado: 'descargando', total: 40, guardados: 12 }))).toBe('Guardando 12/40')
    expect(textoSinConexion(p({ estado: 'descargando' }))).toBe('Guardando…')
    expect(textoSinConexion(p({ estado: 'ninguno' }))).toBeNull()
    expect(textoSinConexion(p({ estado: 'no-disponible' }))).toBeNull()
    expect(textoSinConexion(p({ estado: 'error' }))).toBeNull()
    expect(textoSinConexion(null)).toBeNull()
  })
  it('para el lector de pantalla, dicho entero', () => {
    expect(etiquetaSinConexion(p({ estado: 'descargando', total: 40, guardados: 12 }))).toBe(
      'Guardando para escuchar sin conexión: 12 de 40 capítulos',
    )
    expect(etiquetaSinConexion(p({ estado: 'completo' }))).toBe('Disponible para escuchar sin conexión')
  })
  it('el espacio, como lo diría una persona', () => {
    expect(tamanoLegible(0)).toBe('0 KB')
    expect(tamanoLegible(300)).toBe('1 KB')
    expect(tamanoLegible(850 * 1024)).toBe('850 KB')
    expect(tamanoLegible(12.4 * 1048576)).toBe('12,4 MB')
    expect(tamanoLegible(3 * 1048576)).toBe('3 MB')
    expect(tamanoLegible(1.25 * 1073741824)).toBe('1,3 GB')
  })
})

describe('C10.2/C10.3 · al entrar en «Leyendo», en segundo plano', () => {
  it('pide la voz entera desde el capítulo por donde vas, con la voz elegida, y empieza la copia', async () => {
    alEntrarEnLeyendo(porId('ej-guardian'), 'edge.es-ES-ElviraNeural', 7)
    await vaciar()
    expect(mPrep.preparar).toHaveBeenCalledWith('ej-guardian', 'edge.es-ES-ElviraNeural', 7)
    expect(mGuardar).toHaveBeenCalledWith('ej-guardian')
  })
  it('un libro «solo registro» o un documento no prepara nada', async () => {
    alEntrarEnLeyendo({ ...porId('ej-guardian'), sinArchivo: true }, 'v', 0)
    alEntrarEnLeyendo(porId('ej-doc-notas'), 'v', 0)
    await vaciar()
    expect(mPrep.preparar).not.toHaveBeenCalled()
    expect(mGuardar).not.toHaveBeenCalled()
  })
  it('si el servidor falla no lanza ni bloquea nada', async () => {
    mPrep.preparar.mockRejectedValue(new Error('caído'))
    mGuardar.mockRejectedValue(new Error('sin espacio'))
    expect(() => alEntrarEnLeyendo(porId('ej-guardian'), 'v', 0)).not.toThrow()
    await vaciar()
  })
  it('el capítulo del progreso; sin progreso, el 0', () => {
    expect(capituloDeProgreso({ capitulo: 5 })).toBe(5)
    expect(capituloDeProgreso(null)).toBe(0)
    expect(capituloDeProgreso({ capitulo: -2 })).toBe(0)
  })
})

describe('C10.3 · sincronizar las copias con la lista de «Leyendo»', () => {
  it('con la lista: solo los libros con archivo', async () => {
    sincronizarLeyendo([porId('ej-guardian'), { ...porId('ej-rimas'), sinArchivo: true }])
    await vaciar()
    expect(mSincronizar).toHaveBeenCalledWith([{ id: 'ej-guardian' }])
  })
  it('sin lista: la pide entera al servidor', async () => {
    mLibros.todos.mockResolvedValue(
      ok({ page: 0, size: 200, totalPage: 1, totalElements: 2, list: [porId('ej-guardian'), porId('ej-quijote')] }),
    )
    sincronizarLeyendo()
    await vaciar()
    expect(mLibros.todos).toHaveBeenCalledWith(expect.objectContaining({ pestana: 'LEYENDO', size: 200 }))
    expect(mSincronizar).toHaveBeenCalledWith([{ id: 'ej-guardian' }, { id: 'ej-quijote' }])
  })
  it('si el servidor no contesta bien NO sincroniza (una lista vacía por un fallo borraría todas las copias)', async () => {
    mLibros.todos.mockResolvedValue({ correct: false, message: 'mal', errorCode: 500, object: null as never })
    sincronizarLeyendo()
    mLibros.todos.mockRejectedValueOnce(new Error('sin red'))
    sincronizarLeyendo()
    await vaciar()
    expect(mSincronizar).not.toHaveBeenCalled()
  })
})

describe('C11 · apuntar un libro que ya leí: el formulario', () => {
  const hoy = new Date(2026, 10, 25, 10)
  it('las fechas a mano: 20/11/2026 o 2026-11-20, a las 00:00 UTC (hoy nunca es futuro para el servidor)', () => {
    expect(leerFecha('20/11/2026', hoy)).toEqual({ iso: '2026-11-20T00:00:00Z' })
    expect(leerFecha('2026-11-20', hoy)).toEqual({ iso: '2026-11-20T00:00:00Z' })
    expect(leerFecha('5.3.2019', hoy)).toEqual({ iso: '2019-03-05T00:00:00Z' })
    expect(leerFecha('  ', hoy)).toEqual({ iso: null })
  })
  it('una fecha que no existe, futura o mal escrita se dice', () => {
    expect(leerFecha('31/02/2026', hoy)).toEqual({ error: 'Esa fecha no existe.' })
    expect(leerFecha('26/11/2026', hoy)).toEqual({ error: 'La fecha no puede ser futura.' })
    expect(leerFecha('25/11/2026', hoy)).toEqual({ iso: '2026-11-25T00:00:00Z' })
    expect(leerFecha('ayer', hoy)).toEqual({ error: 'Escribe la fecha como 20/11/2026.' })
  })
  it('los autores por comas o «y», sin repetir', () => {
    expect(leerAutores('Ana, Luis y Marta, Ana')).toEqual(['Ana', 'Luis', 'Marta'])
    expect(leerAutores('  ')).toEqual([])
  })
  it('por defecto Leído; el título es obligatorio', () => {
    expect(REGISTRO_INICIAL.estado).toBe('LEIDO')
    const v = validarRegistro({ ...REGISTRO_INICIAL, titulo: '   ' }, hoy)
    expect(v.ok).toBe(false)
    expect(v.errores.titulo).toBe('El título es obligatorio')
  })
  it('el cuerpo de POST /v1/libros/registro', () => {
    const v = validarRegistro(
      {
        titulo: ' Rayuela ',
        autores: 'Julio Cortázar',
        estado: 'LEIDO',
        fechaFin: '01/06/2020',
        calificacion: 4.5,
        nota: '  Me lo prestó Marta ',
      },
      hoy,
    )
    expect(v).toEqual({
      ok: true,
      errores: {},
      datos: {
        titulo: 'Rayuela',
        autores: ['Julio Cortázar'],
        estado: 'LEIDO',
        fechaFin: '2020-06-01T00:00:00Z',
        calificacion: 4.5,
        nota: 'Me lo prestó Marta',
      },
    })
  })
  it('solo «Leído» lleva fecha de fin (aunque quede escrita); una fecha mala en Leído no deja guardar', () => {
    const porLeer = validarRegistro({ ...REGISTRO_INICIAL, titulo: 'X', estado: 'POR_LEER', fechaFin: 'mal' }, hoy)
    expect(porLeer.ok && porLeer.datos.fechaFin).toBeNull()
    const dejado = validarRegistro(
      { ...REGISTRO_INICIAL, titulo: 'X', estado: 'ABANDONADO', fechaFin: '01/01/2020' },
      hoy,
    )
    expect(dejado.ok && dejado.datos.fechaFin).toBeNull()
    const mala = validarRegistro({ ...REGISTRO_INICIAL, titulo: 'X', fechaFin: '99/99/2020' }, hoy)
    expect(mala.ok).toBe(false)
    expect(mala.errores.fechaFin).toBe('Esa fecha no existe.')
  })
  it('una nota de más de 2000 caracteres no se manda', () => {
    const v = validarRegistro({ ...REGISTRO_INICIAL, titulo: 'X', nota: 'a'.repeat(2001) }, hoy)
    expect(v.ok).toBe(false)
  })
})
