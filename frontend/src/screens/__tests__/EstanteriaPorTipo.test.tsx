import React from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import Lomo from '@componentes/estanteria/Lomo'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import { claveEstanteria } from '@logica/agrupar'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import { estantesService, librosService } from '@servicios/bibliotecaService'
import { estantesIniciales, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO, FiltroLibrosDTO } from '@tipos'

/**
 * ============================================================================
 * LA ESTANTERÍA POR TIPO Y CON FILTROS
 * ============================================================================
 * Anderson buscaba baldas por tipo de libro y filtros por autor en la
 * estantería y no los encontraba. Arriba del mueble hay ahora un control para
 * agrupar las baldas (Colecciones · Géneros · Autores), recordado por usuario,
 * y un botón de filtro con sus chips quitables.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBROS = librosIniciales()
const { estantes, items } = estantesIniciales()
const porId = (id: string) => LIBROS.find((l) => l.id === id) as EjemplarDTO
const soloLibros = LIBROS.filter((l) => l.tipo === 'LIBRO')
const pagina = (list: EjemplarDTO[]) => ok({ page: 0, size: 30, totalPage: 1, totalElements: list.length, list })
const mockLibros = librosService as jest.Mocked<typeof librosService>
const mockEstantes = estantesService as jest.Mocked<typeof estantesService>
const mockGuardado = AsyncStorage as jest.Mocked<typeof AsyncStorage>

/** El servidor de mentira filtra como el de verdad: por géneros y autores. */
const responder = (f: FiltroLibrosDTO) => {
  if (f.pestana === 'LEYENDO') return pagina([])
  let l = soloLibros
  if (f.generos?.length) l = l.filter((x) => x.generos.some((g) => f.generos?.includes(g)))
  if (f.autores?.length) l = l.filter((x) => x.autores.some((a) => f.autores?.includes(a)))
  return pagina(l)
}

const nNovelas = soloLibros.filter((l) => l.generos.includes('Novela')).length
const conGaldos = soloLibros.filter((l) => l.autores.includes('Benito Pérez Galdós')).length
const libros = (n: number) => (n === 1 ? '1 libro' : `${n} libros`)

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Auth, 'useAuth').mockReturnValue({
    user: { userId: '1', name: 'Anderson', email: 'a@casa', roles: ['ADMIN'] },
    token: 't',
    loading: false,
    isAuthenticated: true,
    esAdmin: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
  })
  mockGuardado.getItem.mockImplementation(() => Promise.resolve(null))
  mockLibros.todos.mockImplementation(async (f) => responder(f))
  mockLibros.facetas.mockResolvedValue(
    ok({
      autores: [{ nombre: 'Benito Pérez Galdós', n: conGaldos }],
      generos: [{ nombre: 'Novela', n: nNovelas }],
      anios: [],
      formatos: [{ nombre: 'EPUB', n: 3 }],
      etiquetas: [],
    }),
  )
  mockEstantes.todos.mockResolvedValue(ok(estantes))
  mockEstantes.libros.mockImplementation(async (id) => ok((items[id] ?? []).map(porId)))
})

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const montar = () => {
  const nav = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
    addListener: () => () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- las pantallas reciben las props de react-navigation
  } as any
  return render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, { wrapper: Envoltura })
}

describe('Agrupar las baldas', () => {
  it('por defecto, las colecciones de siempre y el control con «Colecciones» elegido', async () => {
    const r = montar()
    await waitFor(() => expect(r.getByTestId('estante-recientes')).toBeTruthy())
    expect(r.getByTestId('agrupar-COLECCIONES').props.accessibilityState.checked).toBe(true)
    expect(r.queryByTestId('chips-estanteria')).toBeNull()
  })

  it('por género: una balda por género con su placa y su cuenta; se pide toda la biblioteca y se recuerda', async () => {
    const r = montar()
    await waitFor(() => expect(r.getByTestId('estante-recientes')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('agrupar-GENERO')))
    await waitFor(() => expect(r.getByLabelText(`Novela, ${libros(nNovelas)}`)).toBeTruthy())
    expect(r.queryByTestId('estante-recientes')).toBeNull()
    expect(mockLibros.todos).toHaveBeenCalledWith(expect.objectContaining({ pestana: 'TODO', size: 200, page: 0 }))
    expect(mockGuardado.setItem).toHaveBeenCalledWith(
      claveEstanteria('1'),
      expect.stringContaining('"agrupar":"GENERO"'),
    )
  })

  it('por autor, lo recordado del usuario se aplica al abrir', async () => {
    mockGuardado.getItem.mockImplementation((k: string) =>
      Promise.resolve(k === claveEstanteria('1') ? JSON.stringify({ agrupar: 'AUTOR' }) : null),
    )
    const r = montar()
    await waitFor(() => expect(r.getByLabelText(`Benito Pérez Galdós, ${libros(conGaldos)}`)).toBeTruthy())
    expect(r.getByTestId('agrupar-AUTOR').props.accessibilityState.checked).toBe(true)
  })
})

describe('Filtrar la estantería', () => {
  it('desde la hoja: el chip se pone, filtra lo que se ve y se quita con su ✕', async () => {
    const r = montar()
    await waitFor(() => expect(r.getByTestId('estante-recientes')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('filtrar-estanteria')))
    await waitFor(() => expect(mockLibros.facetas).toHaveBeenCalledWith('TODO'))
    await waitFor(() => expect(r.getByLabelText('Novela')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByLabelText('Novela')))
    await waitFor(() =>
      expect(mockLibros.todos).toHaveBeenCalledWith(expect.objectContaining({ generos: ['Novela'], size: 200 })),
    )
    await waitFor(() => expect(r.getByLabelText(`Lo que coincide, ${libros(nNovelas)}`)).toBeTruthy())
    expect(r.getByTestId('filtrar-estanteria').props.accessibilityLabel).toBe('Filtrar la estantería, 1 activos')
    await act(async () => fireEvent.press(r.getByLabelText('Quitar filtro Novela')))
    await waitFor(() => expect(r.queryByLabelText('Quitar filtro Novela')).toBeNull())
    await waitFor(() => expect(r.getByTestId('estante-recientes')).toBeTruthy())
  })

  it('«Ver solo» en una balda de autor deja solo ese autor', async () => {
    mockGuardado.getItem.mockImplementation((k: string) =>
      Promise.resolve(k === claveEstanteria('1') ? JSON.stringify({ agrupar: 'AUTOR' }) : null),
    )
    const r = montar()
    await waitFor(() => expect(r.getByLabelText('Ver solo Benito Pérez Galdós')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByLabelText('Ver solo Benito Pérez Galdós')))
    await waitFor(() => expect(r.getByLabelText('Quitar filtro Benito Pérez Galdós')).toBeTruthy())
    await waitFor(() =>
      expect(mockLibros.todos).toHaveBeenCalledWith(expect.objectContaining({ autores: ['Benito Pérez Galdós'] })),
    )
  })

  it('si nada coincide, lo dice y ofrece quitar los filtros', async () => {
    mockGuardado.getItem.mockImplementation((k: string) =>
      Promise.resolve(
        k === claveEstanteria('1') ? JSON.stringify({ agrupar: 'GENERO', filtros: { generos: ['Ciberpunk'] } }) : null,
      ),
    )
    const r = montar()
    await waitFor(() => expect(r.getByText('Ningún libro pasa estos filtros. Prueba quitando alguno.')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByText('Quitar filtros')))
    await waitFor(() => expect(r.queryByTestId('chips-estanteria')).toBeNull())
  })
})

describe('El lomo pinta el texto compuesto', () => {
  const base = soloLibros[0]
  it('dos líneas cortadas por palabra y sin autor cuando el título llena el lomo', () => {
    const libro = { ...base, id: 'x', titulo: 'Las 21 leyes irrefutables del liderazgo', autores: ['John C. Maxwell'] }
    const r = render(<Lomo libro={libro} />, { wrapper: Envoltura })
    expect(r.queryByText('Maxwell')).toBeNull()
    expect(r.queryByText(/Maxw/)).toBeNull()
    expect(r.getByTestId('lomo-rotulo-x')).toBeTruthy()
  })
  it('un título corto en un lomo gordo lleva el apellido entero', () => {
    const libro = { ...base, id: 'y', titulo: 'Ficciones', autores: ['Jorge Luis Borges'], minutosEstimados: 900 }
    const r = render(<Lomo libro={libro} />, { wrapper: Envoltura })
    expect(r.getByText('Ficciones')).toBeTruthy()
    expect(r.getByText('Borges')).toBeTruthy()
  })
})
