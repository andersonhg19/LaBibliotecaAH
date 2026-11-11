import React from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { AuthProvider } from '@contextos/AuthContext'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import LoginScreen from '@pantallas/auth/LoginScreen'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import LectorScreen from '@pantallas/lector/LectorScreen'
import FichaLibro from '@pantallas/libro/FichaLibro'
import ReproductorScreen from '@pantallas/reproductor/ReproductorScreen'
import {
  anotacionesService,
  estantesService,
  librosService,
  progresoService,
  vocesService,
} from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, estantesIniciales, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO, ProgresoDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

jest.mock('@servicios/bibliotecaService')
const mockNavegar = jest.fn()
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavegar, goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))
jest.mock('@utils/progresoLocal', () => ({
  leerProgresoLocal: jest.fn(async () => null),
  guardarProgresoLocal: jest.fn(async () => undefined),
  esteDispositivo: () => 'PC',
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBROS = librosIniciales()
const { estantes, items } = estantesIniciales()
const porId = (id: string) => LIBROS.find((l) => l.id === id) as EjemplarDTO
const pagina = (list: EjemplarDTO[]) => ok({ page: 0, size: 30, totalPage: 1, totalElements: list.length, list })
const detalle = (id: string) => ok({ ...porId(id), capitulos: CAPITULOS_DEMO, progreso: null })

const mockLibros = librosService as jest.Mocked<typeof librosService>
const mockEstantes = estantesService as jest.Mocked<typeof estantesService>

const usuario = { userId: '1', name: 'Anderson', email: 'a@casa', roles: ['ADMIN'] }
const conSesion = () =>
  jest.spyOn(Auth, 'useAuth').mockReturnValue({
    user: usuario,
    token: 't',
    loading: false,
    isAuthenticated: true,
    esAdmin: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
  })

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- las pantallas reciben las props de react-navigation
const nav: any = { navigate: mockNavegar, goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  mockLibros.todos.mockImplementation(async (f) => {
    const p = f.pestana ?? 'TODO'
    const lista = LIBROS.filter((l) =>
      p === 'LEYENDO' ? l.estado === 'LEYENDO' && l.tipo === 'LIBRO' : p === 'LEIDOS' ? l.estado === 'LEIDO' : true,
    )
    return pagina(lista)
  })
  mockLibros.detalle.mockImplementation(async (id) => detalle(id))
  mockLibros.guardar.mockImplementation(async (d) => ok({ ...porId(d.id), ...d } as EjemplarDTO))
  mockLibros.facetas.mockResolvedValue(ok({ autores: [], generos: [], anios: [], formatos: [], etiquetas: [] }))
  mockEstantes.todos.mockResolvedValue(ok(estantes))
  mockEstantes.libros.mockImplementation(async (id) => ok((items[id] ?? []).map(porId)))
  mockEstantes.ordenar.mockResolvedValue(ok(true))
  ;(anotacionesService.todas as jest.Mock).mockResolvedValue(ok([]))
  ;(vocesService.todas as jest.Mock).mockResolvedValue(ok(VOCES_DEMO))
  ;(progresoService.obtener as jest.Mock).mockResolvedValue(ok(null))
})

describe('La entrada', () => {
  it('valida con zod antes de llamar al servidor', async () => {
    const login = jest.fn(async () => undefined)
    jest.spyOn(Auth, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      loading: false,
      isAuthenticated: false,
      esAdmin: false,
      login,
      register: jest.fn(),
      logout: jest.fn(),
      updateUser: jest.fn(),
    })
    const r = render(<LoginScreen navigation={nav} route={{ key: 'e', name: 'Entrar' }} />, { wrapper: Envoltura })
    expect(r.getByText('La Biblioteca AH')).toBeTruthy()
    fireEvent.press(r.getByTestId('entrar-boton'))
    await waitFor(() => expect(r.getByText(`⚠ ${MENSAJES.requerido('El correo o usuario')}`)).toBeTruthy())
    expect(login).not.toHaveBeenCalled()
    fireEvent.changeText(r.getByTestId('entrar-correo'), '  anderson@casa.co ')
    fireEvent.changeText(r.getByTestId('entrar-clave'), 'secreto1')
    await act(async () => fireEvent.press(r.getByTestId('entrar-boton')))
    expect(login).toHaveBeenCalledWith('anderson@casa.co', 'secreto1')
  })
})

describe('Mi biblioteca', () => {
  beforeEach(conSesion)

  it('pinta los estantes: Leyendo ahora, Recién llegados, Favoritos y colecciones', async () => {
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByTestId('estante-leyendo')).toBeTruthy())
    expect(r.getByTestId('estante-recientes')).toBeTruthy()
    expect(r.getByTestId('estante-est-favoritos')).toBeTruthy()
    expect(r.getByLabelText('Poesía de la tarde, 2 libros')).toBeTruthy()
    expect(r.getAllByTestId('libro-ej-quijote').length).toBeGreaterThan(0)
  })

  it('tocar un libro abre su ficha', async () => {
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getAllByTestId('libro-ej-regenta').length).toBeGreaterThan(0))
    fireEvent.press(r.getAllByTestId('libro-ej-regenta')[0])
    expect(mockNavegar).toHaveBeenCalledWith('Libro', { id: 'ej-regenta' })
  })

  it('ordenar favoritos manda los vecinos a /estantes/{id}/ordenar', async () => {
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByTestId('ordenar-est-favoritos')).toBeTruthy())
    fireEvent.press(r.getByTestId('ordenar-est-favoritos'))
    await act(async () => fireEvent.press(r.getByLabelText(`Mover ${porId('ej-guardian').titulo} a la derecha`)))
    expect(mockEstantes.ordenar).toHaveBeenCalledWith('est-favoritos', {
      ejemplarId: 'ej-guardian',
      despuesDe: 'ej-quijote',
      antesDe: 'ej-rimas',
    })
  })

  it('si el servidor no guarda el orden, se deja como estaba y se dice', async () => {
    mockEstantes.ordenar.mockResolvedValueOnce({ correct: false, message: 'no', errorCode: 103, object: false })
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByTestId('ordenar-est-favoritos')).toBeTruthy())
    fireEvent.press(r.getByTestId('ordenar-est-favoritos'))
    await act(async () => fireEvent.press(r.getByLabelText(`Mover ${porId('ej-guardian').titulo} a la derecha`)))
    await waitFor(() => expect(globalThis.__mockShowToast).toHaveBeenCalledWith('error', MENSAJES.ordenFallo))
  })

  it('el catálogo filtra por pestaña y recuerda los filtros del usuario', async () => {
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    fireEvent.press(r.getByTestId('vista-catalogo'))
    await waitFor(() => expect(r.getByTestId('pestana-LEIDOS')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('pestana-LEIDOS')))
    await waitFor(() =>
      expect(mockLibros.todos).toHaveBeenCalledWith(
        expect.objectContaining({ pestana: 'LEIDOS', orden: 'RECIENTES', page: 0 }),
      ),
    )
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@biblioteca_ah_filtros_1',
        expect.stringContaining('"pestana":"LEIDOS"'),
      ),
    )
  })
})

describe('La ficha del libro', () => {
  beforeEach(conSesion)

  it('muestra el libro, su índice y marca/desmarca favorito', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText(porId('ej-guardian').titulo)).toBeTruthy())
    expect(r.getByText(CAPITULOS_DEMO[0].titulo)).toBeTruthy()
    await act(async () => fireEvent.press(r.getByTestId('favorito')))
    expect(mockLibros.guardar).toHaveBeenCalledWith({ id: 'ej-guardian', favorito: false })
  })

  it('un deseo no se lee: en vez de Leer/Escuchar apagados ofrece «Ya lo tengo» (QA RW-07)', async () => {
    const r = render(<FichaLibro ejemplarId="ej-deseo-1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ya-lo-tengo')).toBeTruthy())
    expect(r.queryByTestId('boton-leer')).toBeNull()
  })
})

describe('El lector', () => {
  beforeEach(conSesion)

  it('pregunta al servidor y ofrece ir a donde siguió otro dispositivo', async () => {
    const { leerProgresoLocal } = jest.requireMock('@utils/progresoLocal')
    const base: ProgresoDTO = {
      ejemplarId: 'ej-guardian',
      capitulo: 0,
      fraseId: 'c000-s00002',
      cfi: null,
      posicionAudioSeg: null,
      vozId: null,
      velocidad: null,
      porcentaje: 10,
      modo: 'VISTA',
      dispositivo: 'PC',
      actualizadoEn: '2026-11-09T10:00:00Z',
    }
    leerProgresoLocal.mockResolvedValueOnce(base)
    ;(progresoService.obtener as jest.Mock).mockResolvedValueOnce(
      ok({
        ...base,
        capitulo: 2,
        fraseId: 'c002-s00004',
        porcentaje: 80,
        dispositivo: 'iPhone',
        actualizadoEn: '2026-11-10T10:00:00Z',
      }),
    )
    const r = render(
      <LectorScreen navigation={nav} route={{ key: 'l', name: 'Leer', params: { id: 'ej-guardian' } }} />,
      { wrapper: Envoltura },
    )
    await waitFor(() => expect(r.getByText(/Seguiste en iPhone hasta el capítulo 3/)).toBeTruthy())
    expect(progresoService.obtener).toHaveBeenCalledWith('ej-guardian')
    expect(r.getByTestId('ir-alli')).toBeTruthy()
  })

  it('un libro sin archivo no se abre y se dice por qué', async () => {
    const r = render(
      <LectorScreen navigation={nav} route={{ key: 'l', name: 'Leer', params: { id: 'ej-deseo-1' } }} />,
      { wrapper: Envoltura },
    )
    await waitFor(() => expect(r.getByText(MENSAJES.lectorSinArchivo)).toBeTruthy())
  })
})

describe('El reproductor', () => {
  beforeEach(conSesion)

  it('ofrece velocidades de 0.5x a 5x, temporizador y las voces', async () => {
    const r = render(
      <ReproductorScreen navigation={nav} route={{ key: 'r', name: 'Escuchar', params: { id: 'ej-guardian' } }} />,
      { wrapper: Envoltura },
    )
    await waitFor(() => expect(r.getByLabelText('0.5x')).toBeTruthy())
    expect(r.getByLabelText('5x')).toBeTruthy()
    expect(r.getByLabelText('Al final del capítulo')).toBeTruthy()
    expect(r.getByLabelText('Álvaro, España, voz de la casa')).toBeTruthy()
    expect(r.getByLabelText('Escuchar una muestra de Elvira')).toBeTruthy()
  })
})

void AuthProvider
