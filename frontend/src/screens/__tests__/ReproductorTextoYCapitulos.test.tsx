import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { textoPosicion } from '@componentes/reproductor/HojaCapitulos'
import { enParrafos, olvidarFrasesEnCache } from '@componentes/reproductor/useFrasesCapitulo'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import ReproductorScreen from '@pantallas/reproductor/ReproductorScreen'
import { librosService, vocesService } from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO } from '@tipos'

/*
 * El reproductor con «Ver texto» (la frase que suena resaltada, seguirla,
 * «Volver a la frase actual», tocar una frase) y los capítulos plegados en una
 * pastilla que abre una hoja.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))
jest.mock('@utils/progresoLocal', () => ({
  leerProgresoLocal: jest.fn(async () => null),
  guardarProgresoLocal: jest.fn(async () => undefined),
  esteDispositivo: () => 'PC',
}))

const mockMotor = {
  alternar: jest.fn(),
  irAFrase: jest.fn(),
  irACapitulo: jest.fn(),
  abrir: jest.fn(),
  pausar: jest.fn(),
  obtener: () => mockEstadoVoz,
}
let mockEstadoVoz: Record<string, unknown> = { libro: null, fase: 'inactivo' }
jest.mock('@contextos/VozContext', () => ({
  motor: new Proxy({}, { get: (_t, k: string) => (mockMotor as Record<string, unknown>)[k] ?? (() => undefined) }),
  useVoz: () => mockEstadoVoz,
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBRO = librosIniciales().find((l) => l.id === 'ej-guardian') as EjemplarDTO
const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }

const FRASES = {
  capitulo: 1,
  frases: [
    { id: 'c001-s00000', texto: 'El faro.', voz: 'El faro.', finParrafo: false, esTitulo: true },
    { id: 'c001-s00001', texto: 'Era de noche.', voz: 'Era de noche.', finParrafo: false, esTitulo: false },
    { id: 'c001-s00002', texto: 'Llovía sobre el muelle.', voz: '…', finParrafo: true, esTitulo: false },
    { id: 'c001-s00003', texto: 'La guardiana subió.', voz: '…', finParrafo: true, esTitulo: false },
  ],
}

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const sonandoEste = (p: Record<string, unknown> = {}) => ({
  libro: { ejemplarId: 'ej-guardian', titulo: LIBRO.titulo, autores: [], portadaUrl: null, capitulos: CAPITULOS_DEMO },
  capitulo: 1,
  vozId: 'edge.es-ES-AlvaroNeural',
  nombreVoz: 'Álvaro',
  velocidad: 1,
  fase: 'reproduciendo',
  mensaje: null,
  posicion: 10,
  duracion: 600,
  fraseId: 'c001-s00001',
  temporizador: null,
  tipoError: null,
  preparacion: null,
  vozPendiente: null,
  ...p,
})

const abrir = () =>
  render(
    <ReproductorScreen
      navigation={nav as never}
      route={{ key: 'r', name: 'Escuchar', params: { id: 'ej-guardian' } }}
    />,
    { wrapper: Envoltura },
  )

let respuestaFrases: () => Promise<Partial<Response>>

beforeEach(() => {
  jest.clearAllMocks()
  olvidarFrasesEnCache()
  mockEstadoVoz = sonandoEste()
  respuestaFrases = async () => ({ ok: true, status: 200, json: async () => FRASES })
  globalThis.fetch = jest.fn(() => respuestaFrases()) as unknown as typeof fetch
  jest.spyOn(Auth, 'useAuth').mockReturnValue({
    user: { userId: '1', name: 'Anderson', email: 'a@casa', roles: [] },
    token: 't',
    loading: false,
    isAuthenticated: true,
    esAdmin: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
  })
  ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...LIBRO, capitulos: CAPITULOS_DEMO, progreso: null }))
  ;(vocesService.todas as jest.Mock).mockResolvedValue(ok(VOCES_DEMO))
})

describe('Ver texto mientras se escucha', () => {
  it('cerrado por defecto: lo de siempre es la carátula; el panel solo se abre al pedirlo', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    expect(r.queryByTestId('panel-texto')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('abre el texto del capítulo que suena con la frase actual resaltada, y se cierra', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    fireEvent.press(r.getByTestId('boton-ver-texto'))
    await waitFor(() => expect(r.getByTestId('panel-frase-c001-s00002')).toBeTruthy())
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toMatch(/\/archivos\/demo-faro\/frases\/cap-001\.json$/)
    expect(r.getByTestId('panel-frase-c001-s00001').props['aria-current']).toBe('true')
    expect(r.getByTestId('panel-frase-c001-s00002').props['aria-current']).toBeUndefined()
    fireEvent.press(r.getByTestId('cerrar-texto'))
    await waitFor(() => expect(r.queryByTestId('panel-texto')).toBeNull())
  })

  it('el resaltado sigue a la voz', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    fireEvent.press(r.getByTestId('boton-ver-texto'))
    await waitFor(() => expect(r.getByTestId('panel-frase-c001-s00003')).toBeTruthy())
    mockEstadoVoz = sonandoEste({ fraseId: 'c001-s00003' })
    r.rerender(
      <ReproductorScreen
        navigation={nav as never}
        route={{ key: 'r', name: 'Escuchar', params: { id: 'ej-guardian' } }}
      />,
    )
    await waitFor(() => expect(r.getByTestId('panel-frase-c001-s00003').props['aria-current']).toBe('true'))
    expect(r.getByTestId('panel-frase-c001-s00001').props['aria-current']).toBeUndefined()
  })

  it('tocar una frase lleva la voz a esa frase', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    fireEvent.press(r.getByTestId('boton-ver-texto'))
    await waitFor(() => expect(r.getByTestId('panel-frase-c001-s00003')).toBeTruthy())
    fireEvent.press(r.getByTestId('panel-frase-c001-s00003'))
    expect(mockMotor.irAFrase).toHaveBeenCalledWith('c001-s00003')
  })

  it('desplazarse a mano deja de seguir y ofrece «Volver a la frase actual»', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    fireEvent.press(r.getByTestId('boton-ver-texto'))
    await waitFor(() => expect(r.getByTestId('panel-texto-scroll')).toBeTruthy())
    expect(r.queryByTestId('volver-frase-actual')).toBeNull()
    fireEvent(r.getByTestId('panel-texto-scroll'), 'scrollBeginDrag')
    await waitFor(() => expect(r.getByTestId('volver-frase-actual')).toBeTruthy())
    fireEvent.press(r.getByTestId('volver-frase-actual'))
    await waitFor(() => expect(r.queryByTestId('volver-frase-actual')).toBeNull())
  })

  it('si el texto no llega: lo dice y deja reintentar', async () => {
    respuestaFrases = async () => ({ ok: false, status: 503, json: async () => ({}) })
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('boton-ver-texto')).toBeTruthy())
    fireEvent.press(r.getByTestId('boton-ver-texto'))
    await waitFor(() => expect(r.getByTestId('reintentar-texto')).toBeTruthy())
    respuestaFrases = async () => ({ ok: true, status: 200, json: async () => FRASES })
    fireEvent.press(r.getByTestId('reintentar-texto'))
    await waitFor(() => expect(r.getByTestId('panel-frase-c001-s00001')).toBeTruthy())
    silencio.mockRestore()
  })
})

describe('Los capítulos, plegados', () => {
  it('cerrados por defecto en una pastilla «Capítulo 2 de N»', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('fila-capitulo')).toBeTruthy())
    expect(r.getByText(`Capítulo 2 de ${CAPITULOS_DEMO.length}`)).toBeTruthy()
    expect(r.queryByTestId('hoja-capitulos')).toBeNull()
    expect(r.queryByTestId('capitulo-fila-0')).toBeNull()
  })

  it('se abren con el actual marcado, se salta al tocar uno y la hoja se cierra sola', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('fila-capitulo')).toBeTruthy())
    fireEvent.press(r.getByTestId('fila-capitulo'))
    await waitFor(() => expect(r.getByTestId('hoja-capitulos')).toBeTruthy())
    expect(r.getByTestId('capitulo-fila-1').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    )
    expect(r.getByTestId('capitulo-fila-0').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    )
    fireEvent.press(r.getByTestId('capitulo-fila-2'))
    expect(mockMotor.irACapitulo).toHaveBeenCalledWith(2)
    await waitFor(() => expect(r.queryByTestId('hoja-capitulos')).toBeNull())
  })

  it('si suena otro libro (o ninguno), elegir un capítulo empieza este libro ahí', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('fila-capitulo')).toBeTruthy())
    fireEvent.press(r.getByTestId('fila-capitulo'))
    await waitFor(() => expect(r.getByTestId('capitulo-fila-2')).toBeTruthy())
    fireEvent.press(r.getByTestId('capitulo-fila-2'))
    expect(mockMotor.irACapitulo).not.toHaveBeenCalled()
    expect(mockMotor.abrir).toHaveBeenCalledWith(
      expect.objectContaining({ ejemplarId: 'ej-guardian' }),
      expect.objectContaining({ capitulo: 2, fraseId: 'c002-s00000' }),
    )
  })
})

describe('enParrafos', () => {
  it('cierra párrafo en cada fin de párrafo y deja cada título solo', () => {
    const p = enParrafos(FRASES.frases)
    expect(p.map((x) => [x.titulo, x.frases.map((f) => f.id)])).toEqual([
      [true, ['c001-s00000']],
      [false, ['c001-s00001', 'c001-s00002']],
      [false, ['c001-s00003']],
    ])
    expect(enParrafos([])).toEqual([])
  })
})

describe('numerar los capítulos de verdad (2026-11-12, «La diosa de tres cabezas»)', () => {
  it('lo de antes del «1 • …» no cuenta, ni una página vacía', () => {
    const caps = [
      { indice: 0, titulo: 'Sección 1', minutos: 1 },
      { indice: 1, titulo: 'Percy Jackson y la diosa de tres cabezas', minutos: 1 },
      { indice: 2, titulo: 'Sección 3', minutos: 1 },
      { indice: 3, titulo: 'Sección 4', minutos: 0 },
      { indice: 4, titulo: 'Sección 5', minutos: 1 },
      { indice: 5, titulo: 'Carta del autor', minutos: 2 },
      { indice: 6, titulo: '1 • Tengo un accidente en el despacho de la directora', minutos: 18 },
      { indice: 7, titulo: '2 • Grover se pone hasta arriba de cafeína', minutos: 13 },
    ]
    expect(textoPosicion(caps, 3, 'La diosa de tres cabezas')).toBe('Inicio · 2 capítulos')
    expect(textoPosicion(caps, 6, 'La diosa de tres cabezas')).toBe('Capítulo 1 de 2')
    expect(textoPosicion(caps, 7, 'La diosa de tres cabezas')).toBe('Capítulo 2 de 2')
  })

  it('sin «1» que lo diga: las «Sección N» sin título del principio tampoco cuentan', () => {
    const caps = [
      { indice: 0, titulo: 'Sección 1', minutos: 1 },
      { indice: 1, titulo: 'El viaje', minutos: 9 },
      { indice: 2, titulo: 'Sección 3', minutos: 9 },
    ]
    expect(textoPosicion(caps, 1, 'X')).toBe('Capítulo 1 de 2')
    expect(textoPosicion(caps, 2, 'X')).toBe('Capítulo 2 de 2')
  })

  it('«Capítulo 10» no se confunde con el primero', () => {
    const caps = [
      { indice: 0, titulo: 'Prólogo', minutos: 3 },
      { indice: 1, titulo: 'Capítulo 10', minutos: 3 },
    ]
    expect(textoPosicion(caps, 1, 'X')).toBe('Capítulo 2 de 2')
  })
})

describe('textoPosicion', () => {
  const caps = [
    { indice: 0, titulo: 'El faro del norte', minutos: 1 },
    { indice: 1, titulo: 'Capítulo 1', minutos: 20 },
    { indice: 2, titulo: 'Capítulo 2', minutos: 20 },
  ]
  it('numera como la ficha: la portadilla no cuenta y coincide con el título', () => {
    expect(textoPosicion(caps, 2, 'El faro del norte')).toBe('Capítulo 2 de 2')
    expect(textoPosicion(caps, 0, 'El faro del norte')).toBe('Inicio · 2 capítulos')
    expect(textoPosicion(caps.slice(1, 2), 1, 'Otro')).toBe('Capítulo 1 de 1')
    // «Inicio» (lo que va antes del primer capítulo en un TXT) tampoco cuenta; «Inicio del viaje» sí es un capítulo
    const conInicio = [{ ...caps[0], titulo: 'Inicio' }, ...caps.slice(1)]
    expect(textoPosicion(conInicio, 2, 'Otro título')).toBe('Capítulo 2 de 2')
    // (sin un «Capítulo 1» que marque el comienzo: con él, lo de antes es preliminar)
    const sinAncla = [
      { indice: 0, titulo: 'Inicio del viaje', minutos: 5 },
      { indice: 1, titulo: 'La tormenta', minutos: 5 },
    ]
    expect(textoPosicion(sinAncla, 1, 'X')).toBe('Capítulo 2 de 2')
  })
})
