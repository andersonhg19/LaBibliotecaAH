import React from 'react'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { ThemeProvider } from '@contextos/ThemeContext'
import { ToastProvider } from '@contextos/ToastContext'
import DocumentosScreen from '@pantallas/biblioteca/DocumentosScreen'
import { carpetasService, librosService } from '@servicios/bibliotecaService'
import type { CarpetaContenidoDTO, CarpetaDTO, EjemplarDTO } from '@tipos'

/*
 * EL ARCHIVADOR (contrato v1.6): carpetas y subcarpetas, migas de pan, abrir
 * cada documento en su sitio (las hojas en el visor), crear, mover varios,
 * borrar eligiendo qué pasa con lo de dentro, y buscar dentro.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })

const doc = (id: string, titulo: string, formatoOriginal: string, p: Partial<EjemplarDTO> = {}): EjemplarDTO =>
  ({
    id,
    archivoId: `ar-${id}`,
    tipo: 'DOCUMENTO',
    estado: 'POR_LEER',
    titulo,
    subtitulo: null,
    autores: [],
    generos: [],
    etiquetas: [],
    favorito: false,
    formatoOriginal,
    estadoConversion: 'LISTO',
    tienePortada: false,
    porcentaje: 0,
    fechaLlegada: '2026-11-12T10:00:00Z',
    nNotas: 0,
    fuenteMetadatos: 'NOMBRE_ARCHIVO',
    carpetaId: 'c-proy',
    ...p,
  }) as unknown as EjemplarDTO

const carpeta = (
  id: string,
  nombre: string,
  padreId: string | null,
  nDocumentos = 0,
  nSubcarpetas = 0,
): CarpetaDTO => ({
  id,
  nombre,
  padreId,
  nDocumentos,
  nSubcarpetas,
})

const PROYECTOS = carpeta('c-proy', 'Proyectos', null, 3, 1)
const CONTENIDO: CarpetaContenidoDTO = {
  carpeta: PROYECTOS,
  ruta: [PROYECTOS],
  subcarpetas: [carpeta('c-2026', '2026', 'c-proy', 1, 0)],
  documentos: [doc('d-hoja', 'Seguimiento', 'XLSX'), doc('d-md', 'Notas de obra', 'MD')],
  totalDocumentos: 7,
  busqueda: false,
  recortado: false,
  ubicaciones: {},
}

const nav = { navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true }
const abrir = (params?: { carpeta?: string }) =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <DocumentosScreen navigation={nav as never} route={{ key: 'd', name: 'Documentos', params }} />
      </ToastProvider>
    </ThemeProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  ;(carpetasService.contenido as jest.Mock).mockResolvedValue(ok(CONTENIDO))
  ;(carpetasService.todas as jest.Mock).mockResolvedValue(
    ok([PROYECTOS, carpeta('c-2026', '2026', 'c-proy', 1), carpeta('c-casa', 'Casa', null)]),
  )
  ;(carpetasService.guardar as jest.Mock).mockResolvedValue(ok(carpeta('c-nueva', 'Facturas', 'c-proy')))
  ;(carpetasService.moverDocumentos as jest.Mock).mockResolvedValue(ok(2))
  ;(carpetasService.borrar as jest.Mock).mockResolvedValue(
    ok({ documentosMovidos: 1, carpetasMovidas: 0, documentosRetirados: 0, carpetasBorradas: 1 }),
  )
})

describe('DocumentosScreen (archivador con carpetas)', () => {
  it('abre la carpeta de la URL con sus migas, subcarpetas y documentos con su tipo', async () => {
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('carpeta-c-2026')).toBeTruthy())
    expect(carpetasService.contenido).toHaveBeenCalledWith({ carpetaId: 'c-proy', texto: '', orden: 'NOMBRE' })
    expect(r.getByLabelText('Ir a Archivador')).toBeTruthy()
    expect(r.getByLabelText('Proyectos, estás aquí')).toBeTruthy()
    expect(r.getByLabelText('Carpeta 2026, 1 documento. Abrir')).toBeTruthy()
    expect(r.getByLabelText('Seguimiento, hoja de cálculo XLSX. Abrir')).toBeTruthy()
    expect(r.getByLabelText('Notas de obra, documento de texto MD. Abrir')).toBeTruthy()
    expect(r.getByText('3 documentos en esta carpeta')).toBeTruthy()
  })

  it('una subcarpeta se abre encima (atrás sube un nivel); una hoja va al visor y un MD al lector', async () => {
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('carpeta-c-2026')).toBeTruthy())
    fireEvent.press(r.getByTestId('carpeta-c-2026'))
    expect(nav.push).toHaveBeenCalledWith('Documentos', { carpeta: 'c-2026' })
    fireEvent.press(r.getByTestId('documento-d-hoja'))
    expect(nav.navigate).toHaveBeenCalledWith('Hoja', { id: 'd-hoja' })
    fireEvent.press(r.getByTestId('documento-d-md'))
    expect(nav.navigate).toHaveBeenCalledWith('Leer', { id: 'd-md' })
    fireEvent.press(r.getByLabelText('Ir a Archivador'))
    expect(nav.push).toHaveBeenCalledWith('Documentos', undefined)
  })

  it('crea una carpeta dentro de la abierta', async () => {
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('nueva-carpeta')).toBeTruthy())
    fireEvent.press(r.getByTestId('nueva-carpeta'))
    fireEvent.changeText(r.getByTestId('campo-nombre-carpeta'), '  Facturas   2026 ')
    await act(async () => {
      fireEvent.press(r.getByTestId('guardar-carpeta'))
    })
    expect(carpetasService.guardar).toHaveBeenCalledWith({ nombre: 'Facturas 2026', padreId: 'c-proy' })
  })

  it('un nombre repetido se dice en el campo y no cierra', async () => {
    ;(carpetasService.guardar as jest.Mock).mockResolvedValue({
      correct: false,
      errorCode: 101,
      message: 'Ya tienes una carpeta llamada "2026" en ese lugar.',
      object: null,
    })
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('nueva-carpeta')).toBeTruthy())
    fireEvent.press(r.getByTestId('nueva-carpeta'))
    fireEvent.changeText(r.getByTestId('campo-nombre-carpeta'), '2026')
    await act(async () => {
      fireEvent.press(r.getByTestId('guardar-carpeta'))
    })
    expect(r.getByTestId('campo-nombre-carpeta').props.accessibilityLabel).toContain('Ya tienes una carpeta llamada')
  })

  it('selecciona varios documentos y los mueve a otra carpeta', async () => {
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('menu-documento-d-hoja')).toBeTruthy())
    fireEvent.press(r.getByTestId('menu-documento-d-hoja'))
    fireEvent.press(r.getByTestId('menu-seleccionar'))
    const md = r.getByTestId('documento-d-md')
    expect(md.props.accessibilityState).toMatchObject({ checked: false })
    fireEvent.press(md)
    expect(r.getByText('2 seleccionados')).toBeTruthy()
    await act(async () => {
      fireEvent.press(r.getByTestId('mover-seleccion'))
    })
    expect(carpetasService.todas).toHaveBeenCalled()
    expect(r.getByTestId('destino-c-proy').props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      fireEvent.press(r.getByTestId('destino-c-casa'))
    })
    expect(carpetasService.moverDocumentos).toHaveBeenCalledWith(['d-hoja', 'd-md'], 'c-casa')
  })

  it('borrar una carpeta con algo dentro obliga a elegir; «pasarlo arriba» sube a la carpeta de arriba', async () => {
    const r = abrir({ carpeta: 'c-proy' })
    await waitFor(() => expect(r.getByTestId('menu-carpeta-c-2026')).toBeTruthy())
    fireEvent.press(r.getByTestId('menu-carpeta-c-2026'))
    fireEvent.press(r.getByTestId('menu-borrar'))
    expect(r.getByText('Pasarlo a «Proyectos»')).toBeTruthy()
    expect(r.getByText('Borrar también 1 documento')).toBeTruthy()
    await act(async () => {
      fireEvent.press(r.getByTestId('borrar-subir'))
    })
    expect(carpetasService.borrar).toHaveBeenCalledWith('c-2026', 'SUBIR')
  })

  it('busca dentro de la carpeta y dice dónde está cada resultado', async () => {
    jest.useFakeTimers()
    try {
      ;(carpetasService.contenido as jest.Mock).mockImplementation(async (f: { texto?: string }) =>
        ok(
          f.texto
            ? {
                ...CONTENIDO,
                busqueda: true,
                subcarpetas: [],
                documentos: [doc('d-act', 'Acta enero', 'DOCX', { carpetaId: 'c-2026' })],
                ubicaciones: { 'c-2026': 'Proyectos / 2026' },
              }
            : CONTENIDO,
        ),
      )
      const r = abrir({ carpeta: 'c-proy' })
      await waitFor(() => expect(r.getByTestId('buscar-documentos')).toBeTruthy())
      fireEvent.changeText(r.getByTestId('buscar-documentos'), 'acta')
      await act(async () => {
        jest.advanceTimersByTime(300)
      })
      await waitFor(() => expect(r.getByText('1 resultado para «acta» en «Proyectos» y sus subcarpetas')).toBeTruthy())
      expect(carpetasService.contenido).toHaveBeenLastCalledWith({
        carpetaId: 'c-proy',
        texto: 'acta',
        orden: 'NOMBRE',
      })
      expect(r.getByText('en Proyectos / 2026')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('la raíz vacía invita a subir y a crear carpetas', async () => {
    ;(carpetasService.contenido as jest.Mock).mockResolvedValue(
      ok({ ...CONTENIDO, carpeta: null, ruta: [], subcarpetas: [], documentos: [], totalDocumentos: 0 }),
    )
    const r = abrir()
    await waitFor(() => expect(r.getByText('El archivador está vacío')).toBeTruthy())
    expect(r.getByText('Subir aquí')).toBeTruthy()
    expect(r.queryByLabelText('Ir a Archivador')).toBeNull()
    expect(r.getByText('0 documentos en el archivador')).toBeTruthy()
    expect(librosService.todos).not.toHaveBeenCalled()
  })
})
