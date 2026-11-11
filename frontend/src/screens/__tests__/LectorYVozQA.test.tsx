import React from 'react'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import type { PropsLector, Ubicacion } from '@componentes/lector/tipos'
import MiniReproductor from '@componentes/reproductor/MiniReproductor'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import LectorScreen from '@pantallas/lector/LectorScreen'
import ReproductorScreen from '@pantallas/reproductor/ReproductorScreen'
import {
  anotacionesService,
  librosService,
  progresoService,
  traduccionService,
  vocesService,
} from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, librosIniciales } from '@servicios/mock/datos'
import type { AnotacionDTO, EjemplarDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

/*
 * Regresiones del QA lector/voz en las PANTALLAS (qa-lector-voz.md). El lector
 * de foliate se sustituye por un doble que deja disparar sus eventos
 * (reubicarse, tocar una nota) como lo haría el navegador.
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

const mockMotor = {
  alternar: jest.fn(),
  capituloSiguiente: jest.fn(),
  capituloAnterior: jest.fn(),
  fraseSiguiente: jest.fn(),
  fraseAnterior: jest.fn(),
  atras15: jest.fn(),
  adelante15: jest.fn(),
  setVelocidad: jest.fn(),
  setVoz: jest.fn(),
  setTemporizador: jest.fn(),
  reintentar: jest.fn(),
  buscar: jest.fn(),
  pausar: jest.fn(),
  detener: jest.fn(),
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

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const ubic = (p: Partial<Ubicacion>): Ubicacion => ({
  fraccion: 0.3,
  cfi: 'epubcfi(/6/8!/4/2)',
  fraseId: 'c001-s00004',
  capitulo: 1,
  etiqueta: 'Capítulo 2',
  motivo: 'navigation',
  porUsuario: false,
  pagina: 12,
  paginas: 80,
  minutosRestantes: 9,
  frases: ['c001-s00004', 'c001-s00005'],
  textoInicio: 'Era de noche.',
  ...p,
})

const NOTA: AnotacionDTO = {
  id: 'n1',
  ejemplarId: 'ej-guardian',
  tipo: 'RESALTADO',
  color: '#D9A35B',
  cfi: 'epubcfi(/6/8!/4/2,/1:0,/1:10)',
  fraseInicio: 'c001-s00004',
  offsetInicio: 0,
  fraseFin: 'c001-s00004',
  offsetFin: 10,
  versionTexto: 1,
  textoCitado: 'Era de noche',
  prefijo: '',
  sufijo: '',
  nota: null,
  capitulo: 1,
}

afterEach(() => jest.useRealTimers())

beforeEach(() => {
  jest.clearAllMocks()
  mockProps = null
  mockEstadoVoz = { libro: null, fase: 'inactivo' }
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
  ;(anotacionesService.todas as jest.Mock).mockResolvedValue(ok([NOTA]))
  ;(anotacionesService.guardar as jest.Mock).mockImplementation(async (a: AnotacionDTO) => ok({ ...a }))
  ;(vocesService.todas as jest.Mock).mockResolvedValue(ok(VOCES_DEMO))
})

const abrirLector = async () => {
  const r = render(
    <LectorScreen navigation={nav as never} route={{ key: 'l', name: 'Leer', params: { id: 'ej-guardian' } }} />,
    {
      wrapper: Envoltura,
    },
  )
  await waitFor(() => expect(mockProps).not.toBeNull())
  return r
}

describe('QA LV-04: abrir un libro no pisa la posición del servidor', () => {
  it('abrir y cerrar sin leer no guarda nada', async () => {
    jest.useFakeTimers()
    const r = await abrirLector()
    act(() => mockProps!.onReubicar(ubic({ motivo: 'navigation', porUsuario: false })))
    await act(() => jest.advanceTimersByTimeAsync(20_000))
    r.unmount()
    expect(progresoService.guardar).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('en cuanto la persona pasa página, sí se guarda', async () => {
    jest.useFakeTimers()
    const r = await abrirLector()
    act(() => mockProps!.onReubicar(ubic({ motivo: 'navigation', porUsuario: false })))
    act(() => mockProps!.onReubicar(ubic({ motivo: 'page', porUsuario: true, fraccion: 0.31 })))
    await act(() => jest.advanceTimersByTimeAsync(3_000))
    expect(progresoService.guardar).toHaveBeenCalledTimes(1)
    expect(progresoService.guardar).toHaveBeenLastCalledWith(expect.objectContaining({ porcentaje: 31, modo: 'VISTA' }))
    r.unmount()
    jest.useRealTimers()
  })
})

describe('QA LV-11: hojear no dispara un guardado por página', () => {
  it('8 páginas en 5 s → un guardado; como mucho uno cada 15 s', async () => {
    jest.useFakeTimers()
    const r = await abrirLector()
    for (let i = 0; i < 8; i++) {
      act(() => mockProps!.onReubicar(ubic({ motivo: 'page', porUsuario: true, fraccion: 0.3 + i / 100 })))
      await act(() => jest.advanceTimersByTimeAsync(600))
    }
    // Antes: 7-8 POST en estos 5 s.
    expect(progresoService.guardar).toHaveBeenCalledTimes(1)
    await act(() => jest.advanceTimersByTimeAsync(8_000))
    expect(progresoService.guardar).toHaveBeenCalledTimes(1)
    await act(() => jest.advanceTimersByTimeAsync(10_000))
    // El último sitio leído se sube a los 15 s del anterior, no antes.
    expect(progresoService.guardar).toHaveBeenCalledTimes(2)
    expect(progresoService.guardar).toHaveBeenLastCalledWith(expect.objectContaining({ porcentaje: 37 }))
    r.unmount()
    jest.useRealTimers()
  })
})

describe('QA LV-06: una nota se edita y se le cambia el color', () => {
  it('desde la hoja de la nota: texto nuevo y color salvia, sin borrarla', async () => {
    const r = await abrirLector()
    act(() => mockProps!.onTocarAnotacion(NOTA))
    await waitFor(() => expect(r.getByText('Guardar cambios')).toBeTruthy())
    fireEvent.press(r.getByLabelText('Verde salvia'))
    fireEvent.changeText(r.getByLabelText('Tu nota'), 'Me recuerda al faro de mi abuelo')
    await act(async () => fireEvent.press(r.getByText('Guardar cambios')))
    expect(anotacionesService.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', color: '#9DB89A', nota: 'Me recuerda al faro de mi abuelo', tipo: 'NOTA' }),
    )
    expect(mockControl.actualizarAnotacion).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', color: '#9DB89A' }),
    )
    expect(anotacionesService.borrar).not.toHaveBeenCalled()
  })
})

describe('QA LV-12: «Mi posición anterior» no se queda fija', () => {
  it('desaparece sola a los pocos segundos', async () => {
    jest.useFakeTimers()
    const r = await abrirLector()
    act(() => mockProps!.onPuedeVolver(true))
    expect(r.getByTestId('posicion-anterior')).toBeTruthy()
    await act(() => jest.advanceTimersByTimeAsync(9_000))
    expect(r.queryByTestId('posicion-anterior')).toBeNull()
    jest.useRealTimers()
  })
})

describe('UX-23: un id de libro inválido no enseña el mensaje técnico', () => {
  it('dice «No se encontró el libro.»', async () => {
    ;(librosService.detalle as jest.Mock).mockResolvedValueOnce({
      correct: false,
      message: 'El parámetro "ejemplarId" no admite el valor enviado (xxxx)',
      errorCode: 102,
      object: null,
    })
    const r = render(
      <LectorScreen navigation={nav as never} route={{ key: 'l', name: 'Leer', params: { id: 'xxxx' } }} />,
      {
        wrapper: Envoltura,
      },
    )
    await waitFor(() => expect(r.getByText(MENSAJES.libroNoEncontrado)).toBeTruthy())
    expect(r.queryByText(/parámetro/)).toBeNull()
  })
})

describe('El marcador de cinta', () => {
  it('«Marcar esta página» guarda un MARCADOR en la frase visible y cuelga la cinta', async () => {
    const r = await abrirLector()
    act(() => mockProps!.onReubicar(ubic({ motivo: 'navigation', porUsuario: false })))
    await act(async () => fireEvent.press(r.getByTestId('marcar-pagina')))
    expect(anotacionesService.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'MARCADOR', fraseInicio: 'c001-s00004', textoCitado: 'Era de noche.' }),
    )
    await waitFor(() => expect(r.getByTestId('cinta-marcador')).toBeTruthy())
  })
})

describe('UX-11 y QA LV-02 en el reproductor', () => {
  const sonandoEste = (p: Record<string, unknown>) => ({
    libro: {
      ejemplarId: 'ej-guardian',
      titulo: LIBRO.titulo,
      autores: [],
      portadaUrl: null,
      capitulos: CAPITULOS_DEMO,
    },
    capitulo: 0,
    vozId: 'edge.es-ES-AlvaroNeural',
    nombreVoz: 'Álvaro',
    velocidad: 1,
    fase: 'reproduciendo',
    mensaje: null,
    posicion: 0,
    duracion: 0,
    fraseId: null,
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
      {
        wrapper: Envoltura,
      },
    )

  it('mientras prepara: cuánto falta, y nada de «-0:00 a 1x»', async () => {
    mockEstadoVoz = sonandoEste({
      fase: 'preparando',
      mensaje: 'Preparando la voz de Álvaro…',
      preparacion: { desde: Date.now(), estimadoSeg: 22 },
    })
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('aviso-voz')).toBeTruthy())
    expect(r.getByText(/Preparando la voz de Álvaro… \(≈ 25 s\)/)).toBeTruthy()
    expect(r.getByTestId('tiempo-restante').props.children).toBe('—:—')
    expect(r.queryByText(/-0:00/)).toBeNull()
  })

  it('con audio dice cuánto queda de verdad a la velocidad elegida', async () => {
    mockEstadoVoz = sonandoEste({ posicion: 60, duracion: 600, velocidad: 2 })
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('tiempo-restante')).toBeTruthy())
    expect(r.getByTestId('tiempo-restante').props.children).toBe('quedan 4:30 a 2x')
  })

  it('capítulo en ERROR: dice el porqué y ofrece «Reintentar»', async () => {
    mockEstadoVoz = sonandoEste({
      fase: 'error',
      tipoError: 'capitulo',
      mensaje: 'La voz de este capítulo no se pudo generar. El motor de voz no respondió.',
    })
    const r = abrir()
    await waitFor(() => expect(r.getByTestId('reintentar-voz')).toBeTruthy())
    fireEvent.press(r.getByTestId('reintentar-voz'))
    expect(mockMotor.reintentar).toHaveBeenCalled()
    expect(r.getByTestId('boton-play').props.accessibilityLabel).toBe('Reintentar')
  })

  it('QA LV-P3: si suena OTRO libro, los controles de este no lo tocan', async () => {
    mockEstadoVoz = sonandoEste({
      libro: { ejemplarId: 'otro', titulo: 'Otro', autores: [], portadaUrl: null, capitulos: [] },
    })
    const r = abrir()
    await waitFor(() => expect(r.getByLabelText('Capítulo siguiente')).toBeTruthy())
    fireEvent.press(r.getByLabelText('Capítulo siguiente'))
    fireEvent.press(r.getByLabelText('Adelantar 15 segundos'))
    expect(mockMotor.capituloSiguiente).not.toHaveBeenCalled()
    expect(mockMotor.adelante15).not.toHaveBeenCalled()
  })
})

describe('El mini reproductor (UX-11, QA LV-02)', () => {
  it('en un fallo ▶ dice «Reintentar» y se puede cerrar (deja de sonar)', () => {
    mockEstadoVoz = {
      libro: {
        ejemplarId: 'ej-guardian',
        titulo: LIBRO.titulo,
        autores: [],
        portadaUrl: null,
        capitulos: CAPITULOS_DEMO,
      },
      capitulo: 1,
      vozId: 'v',
      nombreVoz: 'Álvaro',
      velocidad: 1,
      fase: 'error',
      tipoError: 'red',
      mensaje: 'Sin conexión con la biblioteca. Se reintentará sola; o toca ▶ para probar ya.',
      posicion: 0,
      duracion: 0,
      fraseId: null,
      temporizador: null,
      preparacion: null,
      vozPendiente: null,
    }
    const r = render(<MiniReproductor onAbrir={jest.fn()} />, { wrapper: Envoltura })
    fireEvent.press(r.getByLabelText('Reintentar'))
    expect(mockMotor.alternar).toHaveBeenCalled()
    fireEvent.press(r.getByTestId('mini-cerrar'))
    expect(mockMotor.detener).toHaveBeenCalled()
  })
})

describe('Traducir desde el inglés', () => {
  it('«Traducir» en el menú de la selección abre la hoja con el original y la traducción', async () => {
    ;(traduccionService.traducir as jest.Mock).mockResolvedValue(
      ok({ traduccion: 'Era una noche oscura y tormentosa.', origenDetectado: 'en' }),
    )
    ;(librosService.detalle as jest.Mock).mockResolvedValue(
      ok({ ...LIBRO, idioma: 'en', capitulos: CAPITULOS_DEMO, progreso: null }),
    )
    const r = await abrirLector()
    act(() =>
      mockProps!.onSeleccion({
        texto: 'It was a dark and stormy night.',
        cfi: null,
        fraseInicio: 'c000-s00001',
        offsetInicio: 0,
        fraseFin: 'c000-s00001',
        offsetFin: 31,
        prefijo: '',
        sufijo: '',
        capitulo: 0,
        x: 10,
        y: 300,
        ancho: 200,
        alto: 20,
      }),
    )
    await act(async () => fireEvent.press(r.getByTestId('traducir-seleccion')))
    expect(traduccionService.traducir).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'It was a dark and stormy night.', destino: 'es' }),
    )
    await waitFor(() => expect(r.getByTestId('texto-traducido')).toBeTruthy())
    expect(r.getByText('Era una noche oscura y tormentosa.')).toBeTruthy()
    expect(r.getByText('Guardar como nota')).toBeTruthy()
  })

  it('«Ver en español» solo aparece si el libro no está en español', async () => {
    ;(librosService.detalle as jest.Mock).mockResolvedValue(
      ok({ ...LIBRO, idioma: 'en', capitulos: CAPITULOS_DEMO, progreso: null }),
    )
    const r = await abrirLector()
    fireEvent.press(r.getByTestId('abrir-ajustes-lector'))
    await waitFor(() => expect(r.getByText('Ver en español')).toBeTruthy())
    expect(r.getByLabelText('Texto paralelo')).toBeTruthy()
  })

  it('QA RW-06: en un libro en español el menú de la selección no ofrece «Traducir»; si no se sabe el idioma, sí', async () => {
    const seleccionar = () =>
      act(() =>
        mockProps!.onSeleccion({
          texto: 'Era de noche.',
          cfi: null,
          fraseInicio: 'c000-s00001',
          offsetInicio: 0,
          fraseFin: 'c000-s00001',
          offsetFin: 13,
          prefijo: '',
          sufijo: '',
          capitulo: 0,
          x: 10,
          y: 300,
          ancho: 200,
          alto: 20,
        }),
      )
    ;(librosService.detalle as jest.Mock).mockResolvedValue(
      ok({ ...LIBRO, idioma: 'es', capitulos: CAPITULOS_DEMO, progreso: null }),
    )
    const r = await abrirLector()
    seleccionar()
    await waitFor(() => expect(r.getByTestId('menu-seleccion')).toBeTruthy())
    expect(r.queryByTestId('traducir-seleccion')).toBeNull()
    r.unmount()
    mockProps = null
    ;(librosService.detalle as jest.Mock).mockResolvedValue(
      ok({ ...LIBRO, idioma: null, capitulos: CAPITULOS_DEMO, progreso: null }),
    )
    const r2 = await abrirLector()
    seleccionar()
    await waitFor(() => expect(r2.getByTestId('traducir-seleccion')).toBeTruthy())
  })

  it('en un libro en español no se ofrece', async () => {
    ;(librosService.detalle as jest.Mock).mockResolvedValue(
      ok({ ...LIBRO, idioma: 'es', capitulos: CAPITULOS_DEMO, progreso: null }),
    )
    const r = await abrirLector()
    fireEvent.press(r.getByTestId('abrir-ajustes-lector'))
    await waitFor(() => expect(r.getByText('Leer a tu manera')).toBeTruthy())
    expect(r.queryByText('Ver en español')).toBeNull()
  })
})
