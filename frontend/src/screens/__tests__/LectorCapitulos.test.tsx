import React from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { CLAVE_PISTA } from '@componentes/lector/PistaLector'
import type { InfoLibro, PropsLector, Ubicacion } from '@componentes/lector/tipos'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import LectorScreen from '@pantallas/lector/LectorScreen'
import { anotacionesService, librosService, progresoService } from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO } from '@tipos'

/*
 * «En el modo lectura no sé en qué parte del capítulo voy ni puedo cambiar de
 * capítulo» (Anderson, iPhone). El indicador del pie, ‹ › de capítulo en la
 * barra y el índice con el capítulo de ahora marcado, en los dos modos.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))
jest.mock('@utils/progresoLocal', () => ({
  leerProgresoLocal: jest.fn(async () => null),
  guardarProgresoLocal: jest.fn(async () => undefined),
  esteDispositivo: () => 'iPhone',
}))

const mockControl = {
  irA: jest.fn(async () => {}),
  siguiente: jest.fn(),
  anterior: jest.fn(),
  buscar: jest.fn(async () => []),
  limpiarBusqueda: jest.fn(),
  volverAtras: jest.fn(),
  pintarAnotacion: jest.fn(),
  borrarAnotacion: jest.fn(),
  actualizarAnotacion: jest.fn(),
  limpiarSeleccion: jest.fn(),
  seguirVoz: jest.fn(),
}
let mockProps: PropsLector | null = null
jest.mock('@componentes/lector/LectorFoliate', () => {
  const R = jest.requireActual('react')
  const Doble = R.forwardRef((props: PropsLector, ref: unknown) => {
    mockProps = props
    R.useImperativeHandle(ref, () => mockControl)
    return null
  })
  return { __esModule: true, default: Doble }
})
jest.mock('@contextos/VozContext', () => ({
  motor: new Proxy(
    {},
    { get: (_t, k: string) => (k === 'obtener' ? () => ({ libro: null, fase: 'inactivo' }) : () => {}) },
  ),
  useVoz: () => ({ libro: null, fase: 'inactivo' }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBRO = librosIniciales().find((l) => l.id === 'ej-guardian') as EjemplarDTO
const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const INFO: InfoLibro = {
  indice: [
    { titulo: 'Prólogo', href: 'Text/cap-000.xhtml', nivel: 0 },
    { titulo: 'Capítulo 1', href: 'Text/cap-001.xhtml', nivel: 0 },
    { titulo: 'Capítulo 2', href: 'Text/cap-002.xhtml', nivel: 0 },
    { titulo: 'Capítulo 3', href: 'Text/cap-003.xhtml', nivel: 0 },
  ],
  secciones: [
    { fraccion: 0, titulo: 'Prólogo', href: 'Text/cap-000.xhtml' },
    { fraccion: 0.1, titulo: 'Capítulo 1', href: 'Text/cap-001.xhtml' },
    { fraccion: 0.4, titulo: 'Capítulo 2', href: 'Text/cap-002.xhtml' },
    { fraccion: 0.7, titulo: 'Capítulo 3', href: 'Text/cap-003.xhtml' },
  ],
}

const ubic = (p: Partial<Ubicacion>): Ubicacion => ({
  fraccion: 0.535,
  cfi: 'epubcfi(/6/8!/4/2)',
  fraseId: 'c002-s00004',
  capitulo: 2,
  etiqueta: 'Capítulo 2',
  motivo: 'navigation',
  porUsuario: false,
  pagina: 120,
  paginas: 400,
  minutosRestantes: 6,
  frases: ['c002-s00004'],
  textoInicio: 'Era de noche.',
  ...p,
})

const getItem = AsyncStorage.getItem as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockProps = null
  getItem.mockImplementation(() => Promise.resolve(null))
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
  ;(progresoService.obtener as jest.Mock).mockResolvedValue(ok(null))
  ;(progresoService.guardar as jest.Mock).mockResolvedValue(ok(true))
  ;(anotacionesService.todas as jest.Mock).mockResolvedValue(ok([]))
})

/** Abre el lector en un modo, con el índice cargado y colocado en el 45 % del capítulo 2. */
const abrir = async (modo: 'paginado' | 'continuo', u: Partial<Ubicacion> = {}) => {
  getItem.mockImplementation((k: string) =>
    Promise.resolve(
      k === '@biblioteca_ah_preferencias'
        ? JSON.stringify({ modo, modoElegido: true })
        : k === CLAVE_PISTA
          ? '1'
          : null,
    ),
  )
  const r = render(
    <LectorScreen navigation={nav as never} route={{ key: 'l', name: 'Leer', params: { id: 'ej-guardian' } }} />,
    { wrapper: Envoltura },
  )
  await waitFor(() => expect(mockProps).not.toBeNull())
  await waitFor(() => expect(mockProps!.prefs.modo).toBe(modo))
  act(() => mockProps!.onListo(INFO))
  act(() => mockProps!.onReubicar(ubic(u)))
  return r
}

describe('El indicador del capítulo: siempre a la vista, en los dos modos', () => {
  it.each(['paginado', 'continuo'] as const)('modo %s: «Capítulo 2 · 45 % · quedan 6 min»', async (modo) => {
    const r = await abrir(modo)
    // Con la barra a la vista la pastilla no está (la barra dice lo mismo): pasar página la esconde.
    expect(r.queryByTestId('indicador-capitulo')).toBeNull()
    act(() => mockProps!.onReubicar(ubic({ motivo: 'page', porUsuario: true, cfi: 'otro' })))
    const ind = r.getByTestId('indicador-capitulo')
    expect(r.getAllByText('Capítulo 2').length).toBeGreaterThan(0)
    expect(r.getByText('\u00A0· 45 % · quedan 6 min')).toBeTruthy()
    expect(ind.props.accessibilityLabel).toBe('Capítulo 2, vas por el 45 % del capítulo, quedan 6 min. Abrir el índice')
  })

  it('tocarlo abre el índice con el capítulo de ahora marcado', async () => {
    const r = await abrir('paginado')
    // La barra se va sola al pasar página; entonces la pastilla se puede tocar.
    act(() => mockProps!.onReubicar(ubic({ motivo: 'page', porUsuario: true, cfi: 'otro', fraccion: 0.55 })))
    await act(async () => fireEvent.press(r.getByTestId('indicador-capitulo')))
    const actual = await waitFor(() => r.getByTestId('indice-actual'))
    expect(actual.props.accessibilityLabel).toBe('Capítulo 2, aquí estás · 50 %')
    expect(actual.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
    expect(r.getByText('Aquí estás · 50 %')).toBeTruthy()
    // Solo uno marcado.
    expect(r.getAllByLabelText(/aquí estás/)).toHaveLength(1)
  })
})

describe('El avance se mide desde donde EMPIEZA la página', () => {
  it('en la primera página del capítulo dice 0 % aunque foliate dé el final de la página', async () => {
    const r = await abrir('paginado', { fraccion: 0.47, fraccionInicio: 0.4 })
    expect(r.getByText('0 % del capítulo · p. 120 de 400 · quedan 6 min')).toBeTruthy()
  })
})

describe('‹ capítulo anterior / capítulo siguiente › en la barra', () => {
  it('en medio del libro van al capítulo de antes y al de después por su destino', async () => {
    const r = await abrir('paginado')
    expect(r.getByLabelText('Capítulo anterior: Capítulo 1')).toBeTruthy()
    await act(async () => fireEvent.press(r.getByTestId('capitulo-siguiente')))
    expect(mockControl.irA).toHaveBeenLastCalledWith({ href: 'Text/cap-003.xhtml' })
    await act(async () => fireEvent.press(r.getByTestId('capitulo-anterior')))
    expect(mockControl.irA).toHaveBeenLastCalledWith({ href: 'Text/cap-001.xhtml' })
  })

  it('en el último capítulo «siguiente» está desactivado', async () => {
    const r = await abrir('continuo', { fraccion: 0.9, etiqueta: 'Capítulo 3' })
    const sig = r.getByTestId('capitulo-siguiente')
    expect(sig.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
    expect(r.getByLabelText('No hay capítulo siguiente')).toBeTruthy()
    await act(async () => fireEvent.press(sig))
    expect(mockControl.irA).not.toHaveBeenCalled()
  })

  it('en el prólogo «anterior» está desactivado', async () => {
    const r = await abrir('paginado', { fraccion: 0.02, etiqueta: 'Prólogo' })
    expect(r.getByTestId('capitulo-anterior').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    )
    await act(async () => fireEvent.press(r.getByTestId('capitulo-siguiente')))
    expect(mockControl.irA).toHaveBeenLastCalledWith({ href: 'Text/cap-001.xhtml' })
  })

  it('la fila dice el avance del capítulo y lo que queda (y la página si cabe); tocarla abre el índice', async () => {
    const r = await abrir('paginado')
    expect(r.getByText('45 % del capítulo · p. 120 de 400 · quedan 6 min')).toBeTruthy()
    await act(async () => fireEvent.press(r.getByTestId('fila-capitulo-indice')))
    await waitFor(() => expect(r.getByTestId('indice-actual')).toBeTruthy())
  })
})

describe('La pista de la primera vez', () => {
  it('se enseña una vez cuando la barra se esconde y se recuerda', async () => {
    jest.useFakeTimers()
    getItem.mockImplementation(() => Promise.resolve(null))
    const r = render(
      <LectorScreen navigation={nav as never} route={{ key: 'l', name: 'Leer', params: { id: 'ej-guardian' } }} />,
      { wrapper: Envoltura },
    )
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(r.queryByTestId('pista-lector')).toBeNull()
    await act(() => jest.advanceTimersByTimeAsync(4_500))
    expect(r.getByTestId('pista-lector')).toBeTruthy()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(CLAVE_PISTA, '1')
    // Tocar el centro (como pide la pista) la cierra.
    act(() => mockProps!.onToqueCentro?.())
    expect(r.queryByTestId('pista-lector')).toBeNull()
    r.unmount()
    jest.useRealTimers()
  })

  it('si ya se vio, no vuelve', async () => {
    jest.useFakeTimers()
    getItem.mockImplementation((k: string) => Promise.resolve(k === CLAVE_PISTA ? '1' : null))
    const r = render(
      <LectorScreen navigation={nav as never} route={{ key: 'l', name: 'Leer', params: { id: 'ej-guardian' } }} />,
      { wrapper: Envoltura },
    )
    await act(() => jest.advanceTimersByTimeAsync(6_000))
    expect(r.queryByTestId('pista-lector')).toBeNull()
    r.unmount()
    jest.useRealTimers()
  })
})
