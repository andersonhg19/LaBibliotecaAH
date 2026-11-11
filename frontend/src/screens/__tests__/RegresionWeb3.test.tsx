import React from 'react'

import { Alert, Dimensions, StyleSheet } from 'react-native'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { Toast } from '@componentes/atoms/Toast'
import { repartoAtril } from '@componentes/estanteria/Atril'
import { ANCHO_GALERIA, huecoDeLampara, lamparaDelMueble } from '@componentes/estanteria/Mueble'
import SelectorModo from '@componentes/lector/SelectorModo'
import { opcionesDeModo } from '@componentes/lector/modoLectura'
import HojaConfirmacion from '@componentes/organisms/HojaConfirmacion'
import { elevarAvisos, margenAvisos } from '@componentes/organisms/ToastContainer'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import { esPreliminar, numerarCapitulos } from '@logica/capitulos'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import { FLOTANTE, HUECO_FLOTANTE, esApaisado } from '@pantallas/biblioteca/flotante'
import FichaLibro from '@pantallas/libro/FichaLibro'
import { estantesService, librosService } from '@servicios/bibliotecaService'
import { estantesIniciales, librosIniciales } from '@servicios/mock/datos'
import { paleta } from '@tema/colors'
import type { EjemplarDTO } from '@tipos'
import { confirmarAccion, pedidoDe } from '@utils/confirmar'
import { elegirArchivos } from '@utils/elegirArchivos'

/*
 * QA DE REGRESIÓN DE LA WEB (documentación/pruebas/qa-regresion-web.md):
 * RW-04, RW-05, RW-07, UX-12, UX-28, UX-30, diseño 2-6 y el «Ya lo tengo» del
 * contrato v1.3.2. Lo del lector (RW-02, LV-05, LV-P6, RW-06) está en
 * components/lector/__tests__/lector.test.ts; RW-03 en DisenoYBiblioteca.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@utils/elegirArchivos', () => ({
  ...jest.requireActual('@utils/elegirArchivos'),
  elegirArchivos: jest.fn(),
}))
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBROS = librosIniciales()
const porId = (id: string) => LIBROS.find((l) => l.id === id) as EjemplarDTO
const mockLibros = librosService as jest.Mocked<typeof librosService>
const mockEstantes = estantesService as jest.Mocked<typeof estantesService>

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  mockLibros.detalle.mockImplementation(async (id) => ok({ ...porId(id), capitulos: [], progreso: null }))
  mockLibros.todos.mockImplementation(async () =>
    ok({ page: 0, size: 30, totalPage: 1, totalElements: 2, list: LIBROS.filter((l) => l.tipo === 'LIBRO') }),
  )
  mockLibros.facetas.mockResolvedValue(ok({ autores: [], generos: [], anios: [], formatos: [], etiquetas: [] }))
  const { estantes } = estantesIniciales()
  mockEstantes.todos.mockResolvedValue(ok(estantes))
  mockEstantes.libros.mockResolvedValue(ok([]))
})

describe('RW-07: la ficha de un deseo no enseña Leer ni Escuchar apagados', () => {
  it('solo «Ya lo tengo» y «Dónde conseguirlo»', async () => {
    const r = render(<FichaLibro ejemplarId="ej-deseo-1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ya-lo-tengo')).toBeTruthy())
    expect(r.getByTestId('donde-conseguirlo')).toBeTruthy()
    expect(r.queryByTestId('boton-leer')).toBeNull()
    expect(r.queryByTestId('boton-escuchar')).toBeNull()
  })
  it('un libro sí los tiene', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('boton-leer')).toBeTruthy())
    expect(r.getByTestId('boton-escuchar')).toBeTruthy()
  })
})

describe('UX-30: la ficha numera los capítulos como el índice del lector', () => {
  it('la portadilla (se llama como el libro) y los créditos no llevan número', () => {
    const caps = [
      { titulo: 'El jardín de los senderos de prueba' },
      { titulo: 'Créditos' },
      { titulo: 'Capítulo 1. La casa' },
      { titulo: 'Capítulo 2. El río' },
      { titulo: 'Índice' },
    ]
    expect(numerarCapitulos(caps, 'El jardín de los senderos de prueba')).toEqual([null, null, 1, 2, 3])
  })
  it('un libro sin portadilla se numera desde el primero; uno de un solo bloque también', () => {
    expect(numerarCapitulos([{ titulo: 'Uno' }, { titulo: 'Dos' }], 'Libro')).toEqual([1, 2])
    expect(numerarCapitulos([{ titulo: 'Mi informe' }], 'Mi informe')).toEqual([1])
    expect(esPreliminar('EL JARDÍN de los senderos, de prueba', 'El jardín de los senderos de prueba')).toBe(true)
    expect(esPreliminar('Portadilla', 'X')).toBe(true)
    expect(esPreliminar('La portada del diario', 'X')).toBe(false)
  })
  it('en pantalla: florón en la portadilla y «01» en el capítulo 1, con su nombre accesible', async () => {
    mockLibros.detalle.mockResolvedValue(
      ok({
        ...porId('ej-guardian'),
        capitulos: [
          { indice: 0, titulo: porId('ej-guardian').titulo, minutos: 1 },
          { indice: 1, titulo: 'Capítulo 1', minutos: 5 },
        ],
        progreso: null,
      }),
    )
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByLabelText('Leer el capítulo 1: Capítulo 1')).toBeTruthy())
    expect(r.queryByText('❦')).toBeNull()
    expect(r.getByText('01')).toBeTruthy()
    expect(r.queryByText('02')).toBeNull()
    expect(r.getByLabelText(`Leer la portadilla: ${porId('ej-guardian').titulo}`)).toBeTruthy()
  })
})

describe('UX-28: «Abandonado» no se corta', () => {
  it('cada estado mide lo que su palabra (no cuatro cuartos iguales)', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estado-ABANDONADO')).toBeTruthy())
    const estilo = StyleSheet.flatten(r.getByTestId('estado-ABANDONADO').props.style)
    expect(estilo.flexBasis).toBe('auto')
    expect(estilo.flex).toBeUndefined()
    expect(r.getByText('Abandonado')).toBeTruthy()
  })
})

describe('RW-04 y diseño 5: el aviso va abajo, de pergamino y latón', () => {
  it('se separa del borde de abajo y sube por encima del mini y de la barra del lector', () => {
    expect(margenAvisos(false)).toBe(20)
    expect(margenAvisos(true)).toBe(84)
    expect(margenAvisos(false, 76)).toBe(96)
    const deshacer = elevarAvisos(76)
    deshacer()
  })
  it('la tira es de pergamino con filete de latón, no verde menta, y se cierra al tocarla', () => {
    const cerrar = jest.fn()
    const r = render(<Toast type="success" title="En favoritos" onDismiss={cerrar} />, { wrapper: Envoltura })
    const tira = r.getByTestId('aviso-success')
    const estilo = StyleSheet.flatten(
      typeof tira.props.style === 'function' ? tira.props.style({ pressed: false }) : tira.props.style,
    )
    expect(estilo.backgroundColor).toBe(paleta.pergamino)
    expect(estilo.borderColor).toBe(paleta.laton)
    expect(JSON.stringify(estilo)).not.toMatch(/9CC9A8/i)
    fireEvent.press(tira)
    expect(cerrar).toHaveBeenCalled()
  })
})

describe('Diseño 4: la hoja de confirmación de la casa sustituye a window.confirm', () => {
  it('el mismo API: pregunta, Cancelar no hace nada, y la acción se ejecuta al aceptar', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const r = render(<HojaConfirmacion />, { wrapper: Envoltura })
    const onConfirmar = jest.fn()
    act(() =>
      confirmarAccion({
        titulo: 'Retirar de la biblioteca',
        mensaje: '¿Seguro?',
        textoConfirmar: 'Sí, retirar',
        onConfirmar,
      }),
    )
    await waitFor(() => expect(r.getByTestId('hoja-confirmacion')).toBeTruthy())
    expect(alerta).not.toHaveBeenCalled()
    expect(r.getByText('Retirar de la biblioteca')).toBeTruthy()
    fireEvent.press(r.getByTestId('confirmacion-cancelar'))
    expect(onConfirmar).not.toHaveBeenCalled()
    await waitFor(() => expect(r.queryByTestId('hoja-confirmacion')).toBeNull())

    act(() =>
      confirmarAccion({
        titulo: 'Retirar de la biblioteca',
        mensaje: '¿Seguro?',
        textoConfirmar: 'Sí, retirar',
        onConfirmar,
      }),
    )
    await waitFor(() => expect(r.getByTestId('confirmacion-aceptar')).toBeTruthy())
    const estilo = StyleSheet.flatten(r.getByTestId('confirmacion-aceptar').props.style)
    expect(estilo.backgroundColor).toBe(paleta.burdeos)
    fireEvent.press(r.getByTestId('confirmacion-aceptar'))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    r.unmount()
    alerta.mockRestore()
  })
  it('sabe cuándo una acción es destructiva (burdeos) y cuándo no', () => {
    const f = jest.fn()
    expect(
      pedidoDe({ titulo: 'Borrar nota', mensaje: '', textoConfirmar: 'Sí, borrar', onConfirmar: f }).destructiva,
    ).toBe(true)
    expect(
      pedidoDe({ titulo: 'Cerrar sesión', mensaje: '', textoConfirmar: 'Sí, salir', onConfirmar: f }).destructiva,
    ).toBe(false)
    expect(pedidoDe({ titulo: 'X', mensaje: '', onConfirmar: f, destructiva: true }).destructiva).toBe(true)
    expect(pedidoDe({ titulo: 'X', mensaje: '', onConfirmar: f }).textoConfirmar).toBe('Sí, continuar')
  })
})

describe('Diseño 6: el «+» flotante nunca tapa el último lomo ni la última portada', () => {
  it('las listas dejan debajo al menos lo que ocupa el botón', () => {
    expect(HUECO_FLOTANTE).toBeGreaterThanOrEqual(FLOTANTE.abajo + FLOTANTE.tamano + 16)
  })
})

describe('Diseño 2 y 3: la lámpara según la pantalla', () => {
  it('teléfono: de pie; PC: colgada de la cornisa sin hueco encima; horizontal: ninguna', () => {
    expect(lamparaDelMueble(false, false)).toBe('pie')
    expect(lamparaDelMueble(true, false)).toBe('galeria')
    expect(lamparaDelMueble(false, true)).toBe('ninguna')
    expect(huecoDeLampara('pie', 132)).toBe(86)
    expect(huecoDeLampara('galeria', 198)).toBe(0)
    expect(huecoDeLampara('ninguna', 132)).toBe(0)
    expect(ANCHO_GALERIA).toBeGreaterThan(200)
    expect(esApaisado(390)).toBe(true)
    expect(esApaisado(844)).toBe(false)
  })
})

describe('UX-12 y RW-05: el catálogo en horizontal cabe en una fila', () => {
  const ventana = Dimensions.get('window')
  afterEach(() => act(() => Dimensions.set({ window: ventana, screen: ventana })))

  const montar = async (w: number, h: number) => {
    act(() =>
      Dimensions.set({ window: { ...ventana, width: w, height: h }, screen: { ...ventana, width: w, height: h } }),
    )
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
    const nav = { navigate: jest.fn(), addListener: () => () => undefined } as unknown as React.ComponentProps<
      typeof BibliotecaScreen
    >['navigation']
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    fireEvent.press(r.getByTestId('vista-alternar'))
    await waitFor(() => expect(r.getByTestId('pestana-TODO')).toBeTruthy())
    return r
  }

  it('844×390: la búsqueda es una lupa y pestañas, filtros y orden van en la misma fila', async () => {
    const r = await montar(844, 390)
    expect(r.getByTestId('controles-apaisados')).toBeTruthy()
    expect(r.queryByTestId('buscar')).toBeNull()
    fireEvent.press(r.getByTestId('abrir-busqueda'))
    expect(r.getByTestId('buscar')).toBeTruthy()
    fireEvent.press(r.getByTestId('cerrar-busqueda'))
    expect(r.queryByTestId('buscar')).toBeNull()
    expect(r.getByTestId('abrir-filtros')).toBeTruthy()
    expect(r.getByTestId('abrir-orden')).toBeTruthy()
  })

  it('390×844: la búsqueda a la vista y la fila de pestañas sin bloque de color encima', async () => {
    const r = await montar(390, 844)
    expect(r.queryByTestId('controles-apaisados')).toBeNull()
    expect(r.getByTestId('buscar')).toBeTruthy()
    expect(r.getByTestId('fila-pestanas')).toBeTruthy()
  })
})

describe('Contrato v1.3.2: «Ya lo tengo» manda deseoId y no borra el deseo a mano', () => {
  it('sube un solo archivo con el deseoId y no llama a borrar', async () => {
    const deseo = { ...porId('ej-deseo-1'), nota: 'Regalo' }
    const archivo = Object.assign(new Blob(['x']), { name: 'fortunata.epub' }) as unknown as File
    ;(elegirArchivos as jest.Mock).mockResolvedValue([archivo, archivo])
    mockLibros.subir.mockResolvedValue(ok([{ ...porId('ej-guardian'), id: 'ej-nuevo', nota: 'Regalo' }]))
    const onSubidos = jest.fn()
    const r = render(<SubirLibros visible deseo={deseo} onCerrar={jest.fn()} onSubidos={onSubidos} />, {
      wrapper: Envoltura,
    })
    await act(async () => fireEvent.press(r.getByTestId('elegir-archivos')))
    expect(elegirArchivos).toHaveBeenCalledWith(false)
    await act(async () => fireEvent.press(r.getByTestId('subir')))
    await waitFor(() => expect(onSubidos).toHaveBeenCalled())
    expect(mockLibros.subir).toHaveBeenCalledTimes(1)
    expect(mockLibros.subir.mock.calls[0][3]).toEqual({ deseoId: 'ej-deseo-1' })
    expect(mockLibros.borrar).not.toHaveBeenCalled()
  })
})

describe('«Cómo leer»: tres tarjetas en un grupo de radio', () => {
  it('marca el modo actual y avisa del elegido', () => {
    const elegir = jest.fn()
    const r = render(<SelectorModo opciones={opcionesDeModo(1915, 730)} actual="continuo" onElegir={elegir} />, {
      wrapper: Envoltura,
    })
    expect(r.getByTestId('modo-continuo').props.accessibilityState.checked).toBe(true)
    expect(r.getByTestId('modo-libro').props.accessibilityState.checked).toBe(false)
    expect(r.getByLabelText(/^Hojas: /)).toBeTruthy()
    fireEvent.press(r.getByTestId('modo-libro'))
    expect(elegir).toHaveBeenCalledWith('libro')
  })
})

describe('El atril y la tarjeta «Sigue donde lo dejaste» nunca se pisan', () => {
  // Ancho del atril en el PC: 1440 y 1915 menos el mueble (costados y márgenes).
  for (const ancho of [1360, 1835]) {
    for (const n of [1, 3, 6, 12]) {
      it(`${ancho} px con ${n} libros: ningún libro (ni el «+N») toca la tarjeta y todo cabe`, () => {
        const r = repartoAtril(ancho, n, 140)
        for (const l of r.libros) expect(l.x + l.ancho).toBeLessThanOrEqual(r.tarjeta.x)
        expect(r.tarjeta.x + r.tarjeta.ancho).toBeLessThanOrEqual(ancho)
        expect(r.visibles + r.resto).toBe(n)
        if (r.resto) expect(r.libros.length).toBe(r.visibles + 1)
      })
    }
  }
  it('con 1 a 3 libros todo va junto y centrado, sin «+N»', () => {
    for (const n of [1, 2, 3]) {
      const r = repartoAtril(1360, n, 140)
      expect(r.resto).toBe(0)
      const izq = r.libros[0].x
      const der = 1360 - (r.tarjeta.x + r.tarjeta.ancho)
      expect(Math.abs(izq - der)).toBeLessThanOrEqual(30)
    }
  })
  it('con 12 libros en 1440 se ven los que caben y el resto va en «+N»', () => {
    const r = repartoAtril(1360, 12, 140)
    expect(r.resto).toBeGreaterThan(0)
    expect(r.visibles).toBeGreaterThan(2)
  })
})
