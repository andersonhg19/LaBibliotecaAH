import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import ReproductorScreen from '@pantallas/reproductor/ReproductorScreen'
import { librosService, vocesService } from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO } from '@tipos'

/*
 * Arreglos de la validación web 0.4.0 en el reproductor:
 *  · V-NUEVO-1: abrir el reproductor pedía el libro y las voces ~100 veces por
 *    segundo sin parar (la tarea de useCarga era una función nueva en cada render).
 *  · V-NUEVO-6: antes de empezar enseñaba «Dedicatoria» (fuera de la voz) como
 *    capítulo actual, aunque ▶ empieza en el primero con voz.
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

const mockMotor = { abrir: jest.fn(), alternar: jest.fn(), obtener: () => mockEstadoVoz }
let mockEstadoVoz: Record<string, unknown> = { libro: null, fase: 'inactivo' }
jest.mock('@contextos/VozContext', () => ({
  motor: new Proxy({}, { get: (_t, k: string) => (mockMotor as Record<string, unknown>)[k] ?? (() => undefined) }),
  useVoz: () => mockEstadoVoz,
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBRO = librosIniciales().find((l) => l.id === 'ej-guardian') as EjemplarDTO
const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const pantalla = () => (
  <ReproductorScreen navigation={nav as never} route={{ key: 'r', name: 'Escuchar', params: { id: 'ej-guardian' } }} />
)

const sonando = (posicion: number) => ({
  libro: { ejemplarId: 'ej-guardian', titulo: LIBRO.titulo, autores: [], portadaUrl: null, capitulos: CAPITULOS_DEMO },
  capitulo: 1,
  vozId: 'edge.es-ES-AlvaroNeural',
  nombreVoz: 'Álvaro',
  velocidad: 1,
  fase: 'reproduciendo',
  mensaje: null,
  posicion,
  duracion: 600,
  fraseId: 'c001-s00001',
  temporizador: null,
  tipoError: null,
  preparacion: null,
  vozPendiente: null,
})

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  jest.clearAllMocks()
  mockEstadoVoz = sonando(10)
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

describe('V-NUEVO-1 · el reproductor pide el libro UNA vez', () => {
  it('aunque la voz avance y la pantalla se repinte muchas veces', async () => {
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    // La voz avanza: cada estado nuevo repinta la pantalla (como 4 veces por segundo al sonar).
    for (let s = 11; s < 31; s++) {
      mockEstadoVoz = sonando(s)
      r.rerender(pantalla())
      await espera(5)
    }
    await espera(100)
    expect(librosService.detalle).toHaveBeenCalledTimes(1)
    expect(vocesService.todas).toHaveBeenCalledTimes(1)
  })

  it('quieto (sin sonar ni repintar desde fuera) tampoco vuelve a pedir', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    await espera(300)
    expect(librosService.detalle).toHaveBeenCalledTimes(1)
    expect(vocesService.todas).toHaveBeenCalledTimes(1)
  })
})

describe('V-NUEVO-6 · antes de empezar se ve el capítulo que va a sonar', () => {
  const CAPS = [
    { indice: 0, titulo: 'Dedicatoria', minutos: 1, numero: null, region: 'antes', tipo: 'dedicatoria', enVoz: false },
    { indice: 1, titulo: 'Primero', minutos: 3, numero: 1, region: 'cuerpo', tipo: 'capitulo', enVoz: true },
    { indice: 2, titulo: 'Segundo', minutos: 3, numero: 2, region: 'cuerpo', tipo: 'capitulo', enVoz: true },
  ]

  it('sin progreso: el primero con voz («Primero»), no la dedicatoria apartada', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...LIBRO, capitulos: CAPS, progreso: null }))
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    expect(r.getByRole('header', { name: 'Primero' })).toBeTruthy()
    expect(r.queryByRole('header', { name: 'Dedicatoria' })).toBeNull()
  })

  it('y ▶ empieza justo ahí (lo que se ve es lo que suena)', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...LIBRO, capitulos: CAPS, progreso: null }))
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    fireEvent.press(r.getByText('Escuchar este libro'))
    expect(mockMotor.abrir).toHaveBeenCalledWith(
      expect.objectContaining({ ejemplarId: 'ej-guardian' }),
      expect.objectContaining({ capitulo: 1, posicion: 0, fraseId: null }),
    )
  })

  it('con el progreso al principio de la dedicatoria (fuera de la voz): también «Primero»', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    const progreso = { capitulo: 0, modo: 'VOZ', posicionAudioSeg: 0, vozId: null, fraseId: null }
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...LIBRO, capitulos: CAPS, progreso }))
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    expect(r.getByRole('header', { name: 'Primero' })).toBeTruthy()
  })

  it('con progreso: el del progreso', async () => {
    mockEstadoVoz = { libro: null, fase: 'inactivo', capitulo: 0, fraseId: null }
    const progreso = { capitulo: 2, modo: 'VOZ', posicionAudioSeg: 30, vozId: null, fraseId: null }
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...LIBRO, capitulos: CAPS, progreso }))
    const r = render(pantalla(), { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-controles')).toBeTruthy())
    expect(r.getByRole('header', { name: 'Segundo' })).toBeTruthy()
  })
})
