import React from 'react'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import type { HojaDeCalculo, LibroDeHojas } from '@componentes/hoja/tipos'
import { ThemeProvider } from '@contextos/ThemeContext'
import HojaScreen, { MENSAJES_HOJA, descargarHoja } from '@pantallas/hoja/HojaScreen'
import { librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO } from '@tipos'

/*
 * EL VISOR DE HOJAS (v1.6): una hoja de cálculo se abre en su rejilla, con
 * una lengüeta por hoja, aviso si viene recortada y búsqueda en todas. Un
 * documento que no es hoja se manda al lector.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })

const DOC = {
  id: 'ej-hoja',
  archivoId: 'ar-hoja',
  tipo: 'DOCUMENTO',
  estado: 'POR_LEER',
  titulo: 'Seguimiento del proyecto',
  subtitulo: null,
  autores: [],
  anio: null,
  editorial: null,
  idioma: null,
  isbn: null,
  sinopsis: null,
  generos: [],
  etiquetas: [],
  calificacion: null,
  favorito: false,
  formatoOriginal: 'XLSX',
  estadoConversion: 'LISTO',
  tienePortada: false,
  minutosEstimados: null,
  porcentaje: 0,
  fechaLlegada: '2026-11-12T10:00:00Z',
  ultimaApertura: null,
  fechaFin: null,
  nNotas: 0,
  fuenteMetadatos: 'NOMBRE_ARCHIVO',
  capitulos: [],
  progreso: null,
} as unknown as EjemplarDTO

const hoja = (nombre: string, p: Partial<HojaDeCalculo> = {}): HojaDeCalculo => ({
  nombre,
  filas: 3,
  columnas: 2,
  filasOriginal: 3,
  columnasOriginal: 2,
  recortada: false,
  fijas: { filas: 1, columnas: 1 },
  anchos: [120, 90],
  altos: [],
  celdas: [
    [0, 0, 'Tarea', 't', 1],
    [0, 1, 'Costo', 't', 1],
    [1, 0, 'Diseño', 't', 0],
    [1, 1, '$ 1.200.000', 'n', 0],
  ],
  combinadas: [],
  estilos: [{}, { negrita: true }],
  ...p,
})

const LIBRO: LibroDeHojas = {
  versionFormato: 1,
  recortado: false,
  hojas: [hoja('Tareas'), hoja('Presupuesto', { recortada: true, filas: 5000, filasOriginal: 12000 })],
}

const respuesta = (status: number, cuerpo: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo }) as unknown as Response

const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }
const abrir = () =>
  render(
    <ThemeProvider>
      <HojaScreen navigation={nav as never} route={{ key: 'h', name: 'Hoja', params: { id: 'ej-hoja' } }} />
    </ThemeProvider>,
  )

let fetchMock: jest.Mock
beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn(async () => respuesta(200, LIBRO))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  ;(librosService.detalle as jest.Mock).mockResolvedValue(ok(DOC))
})

describe('HojaScreen', () => {
  it('abre la hoja con una lengüeta por hoja y la primera elegida', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('visor-hoja')).toBeTruthy())
    expect(fetchMock.mock.calls[0][0]).toContain('/archivos/ar-hoja/hoja.json')
    const tareas = r.getByLabelText('Hoja Tareas')
    expect(tareas.props.accessibilityState).toMatchObject({ selected: true })
    expect(r.getByLabelText('Hoja Presupuesto').props.accessibilityState).toMatchObject({ selected: false })
    expect(r.getByText('Diseño')).toBeTruthy()
    expect(r.queryByTestId('hoja-aviso-recorte')).toBeNull()
  })

  it('avisa al cambiar a una hoja recortada', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('visor-hoja')).toBeTruthy())
    fireEvent.press(r.getByLabelText('Hoja Presupuesto'))
    expect(r.getByTestId('hoja-aviso-recorte').props.children).toBe('Se muestran las primeras 5.000 filas de 12.000.')
  })

  it('busca en todas las hojas y cuenta las coincidencias', async () => {
    jest.useFakeTimers()
    try {
      const r = abrir()
      await waitFor(() => expect(r.getByTestId('visor-hoja')).toBeTruthy())
      fireEvent.press(r.getByLabelText('Buscar en la hoja'))
      fireEvent.changeText(r.getByLabelText('Texto a buscar'), 'diseno')
      act(() => {
        jest.advanceTimersByTime(300)
      })
      expect(r.getByText('0 de 2')).toBeTruthy()
      fireEvent.press(r.getByLabelText('Coincidencia siguiente'))
      expect(r.getByText('1 de 2')).toBeTruthy()
      expect(r.getByTestId('hoja-seleccion').props.children).toBe('A2 · Diseño')
      fireEvent.press(r.getByLabelText('Coincidencia siguiente'))
      expect(r.getByText('2 de 2')).toBeTruthy()
      expect(r.getByLabelText('Hoja Presupuesto').props.accessibilityState).toMatchObject({ selected: true })
    } finally {
      jest.useRealTimers()
    }
  })

  it('el zoom tiene botones con nombre', async () => {
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('visor-hoja')).toBeTruthy())
    fireEvent.press(r.getByLabelText('Acercar'))
    expect(r.getByLabelText('Zoom 110 %')).toBeTruthy()
    fireEvent.press(r.getByLabelText('Alejar'))
    fireEvent.press(r.getByLabelText('Alejar'))
    expect(r.getByLabelText('Zoom 90 %')).toBeTruthy()
  })

  it('un documento que no es hoja se abre en el lector', async () => {
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...DOC, formatoOriginal: 'MD' }))
    abrir()
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('Leer', { id: 'ej-hoja' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si aún se prepara lo dice y no descarga nada', async () => {
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ ...DOC, estadoConversion: 'PROCESANDO' }))
    const r = abrir()
    await waitFor(() => expect(r.getByText('Preparando la hoja de cálculo…')).toBeTruthy())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un 404 dice que aún no está lista, con Reintentar', async () => {
    fetchMock.mockResolvedValue(respuesta(404, null))
    const r = abrir()
    await waitFor(() => expect(r.getByText(MENSAJES_HOJA.noLista)).toBeTruthy())
    expect(r.getByText('Reintentar')).toBeTruthy()
  })
})

describe('descargarHoja', () => {
  it('503 → disco no disponible; JSON de otra versión → mensaje claro', async () => {
    globalThis.fetch = jest.fn(async () => respuesta(503, null)) as unknown as typeof fetch
    await expect(descargarHoja('a')).rejects.toThrow(MENSAJES_HOJA.sinDatos)
    const espia = jest.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.fetch = jest.fn(async () => respuesta(200, { versionFormato: 9 })) as unknown as typeof fetch
    await expect(descargarHoja('a')).rejects.toThrow(/no entiende/)
    globalThis.fetch = jest.fn(async () => respuesta(500, null)) as unknown as typeof fetch
    await expect(descargarHoja('a')).rejects.toThrow(MENSAJES_HOJA.fallo)
    globalThis.fetch = jest.fn(async () => {
      throw new Error('red')
    }) as unknown as typeof fetch
    await expect(descargarHoja('a')).rejects.toThrow(/conexión/)
    espia.mockRestore()
  })
})
