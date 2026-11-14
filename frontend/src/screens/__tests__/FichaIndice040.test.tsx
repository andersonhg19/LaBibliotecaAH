import React from 'react'

import { Dimensions } from 'react-native'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import Esqueleto from '@componentes/atoms/Esqueleto'
import { leerCasa, olvidarEstadoCasa } from '@componentes/molecules/LamparaCasa'
import { textoPreparacion } from '@componentes/molecules/PrepararLibro'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import { estructurarIndice } from '@logica/capitulos'
import FichaLibro from '@pantallas/libro/FichaLibro'
import { esSoloHistoria } from '@pantallas/libro/IndiceLibro'
import {
  capitulosVozService,
  estadoCasaService,
  estantesService,
  librosService,
  preparacionService,
} from '@servicios/bibliotecaService'
import { librosIniciales } from '@servicios/mock/datos'
import type { CapituloResumen, EjemplarDTO } from '@tipos'
import { trayectoria } from '@utils/confeti'
import { guardarOrigen, hayVueloPara, transformDesde, volarPortada } from '@utils/vuelo'

/*
 * LA FICHA 0.4.0: índice agrupado (E12), 🎧 por capítulo y «Solo la historia»
 * (C13), «Preparar el libro entero» (F9), la lámpara de la casa (F11), la
 * barra fija de Seguir/Escuchar en el teléfono (E2), los esqueletos (F3), la
 * portada que vuela (F2) y el confeti (F5).
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBRO = librosIniciales().find((l) => l.id === 'ej-guardian') as EjemplarDTO
const mLibros = librosService as jest.Mocked<typeof librosService>
const mVoz = capitulosVozService as jest.Mocked<typeof capitulosVozService>
const mPrep = preparacionService as jest.Mocked<typeof preparacionService>
const mCasa = estadoCasaService as jest.Mocked<typeof estadoCasaService>

const V2: CapituloResumen[] = [
  { indice: 0, titulo: 'Créditos', minutos: 1, numero: null, region: 'antes', tipo: 'creditos', enVoz: false },
  { indice: 1, titulo: 'Primera parte', minutos: 0, numero: null, region: 'cuerpo', tipo: 'parte', enVoz: true },
  { indice: 2, titulo: 'La llegada', minutos: 9, numero: 1, region: 'cuerpo', tipo: 'capitulo', enVoz: true },
  { indice: 3, titulo: 'El faro', minutos: 8, numero: 2, region: 'cuerpo', tipo: 'capitulo', enVoz: true },
  { indice: 4, titulo: 'Agradecimientos', minutos: 1, numero: null, region: 'despues', tipo: 'otro', enVoz: false },
]

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const conCapitulos = (capitulos: CapituloResumen[]) =>
  mLibros.detalle.mockImplementation(async () => ok({ ...LIBRO, capitulos, progreso: null }))

beforeEach(() => {
  jest.clearAllMocks()
  olvidarEstadoCasa()
  ;(estantesService.todos as jest.Mock).mockResolvedValue(ok([]))
  conCapitulos(V2)
})

describe('E12 · índice agrupado', () => {
  it('Antes de empezar · Capítulos (con la parte de cabecera) · Al final', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('indice-libro')).toBeTruthy())
    expect(r.getByText('Antes de empezar')).toBeTruthy()
    expect(r.getByText('Capítulos')).toBeTruthy()
    expect(r.getByText('Al final')).toBeTruthy()
    expect(r.getByTestId('indice-parte-1')).toBeTruthy()
    expect(r.getByLabelText('Leer el capítulo 1: La llegada')).toBeTruthy()
    expect(r.getByLabelText('Leer la sección del final: Agradecimientos')).toBeTruthy()
    expect(r.getByText('02')).toBeTruthy()
    expect(r.queryByText('03')).toBeNull()
  })
  it('un libro v1 sin antes ni final: la lista de siempre, sin cabeceras ni 🎧', async () => {
    conCapitulos([
      { indice: 0, titulo: 'Capítulo 1', minutos: 5 },
      { indice: 1, titulo: 'Capítulo 2', minutos: 5 },
    ])
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('01')).toBeTruthy())
    expect(r.queryByText('Antes de empezar')).toBeNull()
    expect(r.queryByTestId('envoz-0')).toBeNull()
    expect(r.queryByTestId('solo-historia')).toBeNull()
  })
})

describe('C13 · 🎧 por capítulo y «Solo la historia»', () => {
  it('el interruptor apaga un capítulo y lo guarda en el servidor', async () => {
    mVoz.cambiar.mockResolvedValue(ok({ ...V2[3], enVoz: false }))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('envoz-3')).toBeTruthy())
    expect(r.getByTestId('envoz-3').props.accessibilityState?.checked).toBe(true)
    await act(async () => fireEvent.press(r.getByTestId('envoz-3')))
    expect(mVoz.cambiar).toHaveBeenCalledWith('ej-guardian', 3, false)
    await waitFor(() => expect(r.getByTestId('envoz-3').props.accessibilityState?.checked).toBe(false))
  })
  it('si el servidor no tiene la ruta (404) vuelve como estaba', async () => {
    mVoz.cambiar.mockRejectedValue({ response: { status: 404 } })
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('envoz-2')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('envoz-2')))
    await waitFor(() => expect(r.getByTestId('envoz-2').props.accessibilityState?.checked).toBe(true))
  })
  it('«Solo la historia» está activo si en la voz va justo el cuerpo; al tocarlo se pide y se recarga', async () => {
    mVoz.soloHistoria.mockResolvedValue(ok(true))
    const caps = V2.map((c) => ({ ...c, enVoz: true }))
    conCapitulos(caps)
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('solo-historia')).toBeTruthy())
    expect(r.getByTestId('solo-historia').props.accessibilityState?.checked).toBe(false)
    const llamadas = mLibros.detalle.mock.calls.length
    await act(async () => fireEvent.press(r.getByTestId('solo-historia')))
    expect(mVoz.soloHistoria).toHaveBeenCalledWith('ej-guardian', true)
    await waitFor(() => expect(mLibros.detalle.mock.calls.length).toBeGreaterThan(llamadas))
  })
  it('esSoloHistoria', () => {
    const l = estructurarIndice(V2, 'X')
    expect(esSoloHistoria(V2, l)).toBe(true)
    expect(
      esSoloHistoria(
        V2.map((c) => ({ ...c, enVoz: true })),
        l,
      ),
    ).toBe(false)
  })
})

describe('F9 · preparar el libro entero y F11 · la lámpara de la casa', () => {
  it('enseña «12 de 40» y pide preparar el resto', async () => {
    mPrep.estado.mockResolvedValue(ok({ total: 40, listos: 12, enCola: 0, error: 0 }))
    mPrep.preparar.mockResolvedValue(ok(true))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('12 de 40 capítulos listos')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('boton-preparar-libro')))
    expect(mPrep.preparar).toHaveBeenCalledWith('ej-guardian', expect.any(String))
  })
  it('sin la ruta en el servidor no se enseña nada', async () => {
    mPrep.estado.mockRejectedValue({ response: { status: 404 } })
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('indice-libro')).toBeTruthy())
    expect(r.queryByTestId('preparar-libro')).toBeNull()
  })
  it('textos de la preparación', () => {
    expect(textoPreparacion({ total: 40, listos: 12, enCola: 28, error: 0 })).toBe(
      '12 de 40 capítulos listos · preparando…',
    )
    expect(textoPreparacion({ total: 4, listos: 2, enCola: 0, error: 2 })).toBe('2 de 4 capítulos listos · 2 con error')
    expect(textoPreparacion({ total: 4, listos: 4, enCola: 0, error: 0 })).toMatch(/Todo el libro está listo/)
  })
  it('la lámpara habla en palabras de casa', async () => {
    mCasa.obtener.mockResolvedValue(ok({ taller: 'LENTO', traductor: 'OK', disco: 'OK', colaVoz: 3, mensaje: null }))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('lampara-casa')).toBeTruthy())
    expect(r.getByText('El taller va despacio (3 capítulos en cola): las voces tardarán un poco.')).toBeTruthy()
    const base = { taller: 'OK' as const, traductor: 'OK' as const, disco: 'OK' as const, colaVoz: 0, mensaje: null }
    expect(leerCasa(base)).toEqual({ luz: 'encendida', frase: 'La casa está despierta.' })
    expect(leerCasa({ ...base, disco: 'DESCONECTADO' }).luz).toBe('apagada')
    expect(leerCasa({ ...base, taller: 'CAIDO' }).frase).toMatch(/apagado/)
    expect(leerCasa({ ...base, mensaje: 'Reiniciando' }).frase).toBe('Reiniciando')
  })
})

describe('E2 · en el teléfono, Seguir leyendo / Escuchar en una barra fija', () => {
  const ventana = Dimensions.get('window')
  afterEach(() => act(() => Dimensions.set({ window: ventana, screen: ventana })))
  it('a 390 px van abajo (una sola vez); a 1024 px en la cabecera', async () => {
    act(() =>
      Dimensions.set({
        window: { ...ventana, width: 390, height: 844 },
        screen: { ...ventana, width: 390, height: 844 },
      }),
    )
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('barra-acciones-ficha')).toBeTruthy())
    expect(r.getAllByTestId('boton-leer')).toHaveLength(1)
    act(() =>
      Dimensions.set({
        window: { ...ventana, width: 1024, height: 768 },
        screen: { ...ventana, width: 1024, height: 768 },
      }),
    )
    await waitFor(() => expect(r.queryByTestId('barra-acciones-ficha')).toBeNull())
    expect(r.getAllByTestId('boton-leer')).toHaveLength(1)
  })
})

describe('F3 · esqueletos', () => {
  it('la ficha carga con su silueta, no con la rueda', async () => {
    let soltar: (v: unknown) => void = () => {}
    mLibros.detalle.mockImplementation(() => new Promise((res) => (soltar = res as typeof soltar)))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    expect(r.getByTestId('esqueleto-ficha')).toBeTruthy()
    await act(async () => soltar(ok({ ...LIBRO, capitulos: V2, progreso: null })))
    await waitFor(() => expect(r.queryByTestId('esqueleto-ficha')).toBeNull())
  })
  it('las variantes se anuncian una vez como «Cargando…»', () => {
    for (const v of ['ficha', 'portadas', 'baldas'] as const) {
      const r = render(<Esqueleto variante={v} ancho={390} />, { wrapper: Envoltura })
      expect(r.getByLabelText('Cargando…')).toBeTruthy()
      r.unmount()
    }
  })
})

describe('F2 · la portada vuela (FLIP) y F5 · confeti', () => {
  it('transformación de origen a destino', () => {
    expect(
      transformDesde({ left: 10, top: 20, width: 50, height: 75 }, { left: 110, top: 220, width: 100, height: 150 }),
    ).toBe('translate(-100px, -200px) scale(0.5, 0.5)')
  })
  it('un origen sirve una vez, solo para su libro y poco rato', () => {
    const anim = jest.fn()
    const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 150 }), animate: anim, style: {} }
    guardarOrigen('a', { left: 5, top: 5, width: 50, height: 75 }, 1000)
    expect(hayVueloPara('b', 1100)).toBe(false)
    expect(hayVueloPara('a', 4000)).toBe(false)
    expect(volarPortada('a', el, 1200)).toBe(true)
    expect(anim.mock.calls[0][1].duration).toBeLessThanOrEqual(400)
    expect(volarPortada('a', el, 1300)).toBe(false)
  })
  it('el confeti cae hacia abajo, con colores de la casa', () => {
    const t = trayectoria(1, () => 0.5)
    expect(t.cae).toBeGreaterThan(0)
    expect(t.color).toBe('#C9A227')
  })
})
