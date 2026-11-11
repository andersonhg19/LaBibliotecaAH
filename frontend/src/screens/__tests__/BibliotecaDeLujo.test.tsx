import React from 'react'

import { Alert } from 'react-native'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import RegisterScreen from '@pantallas/auth/RegisterScreen'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import FichaLibro from '@pantallas/libro/FichaLibro'
import NotasScreen from '@pantallas/notas/NotasScreen'
import {
  anotacionesService,
  comentariosService,
  estantesService,
  librosService,
  progresoService,
  vocesService,
} from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, estantesIniciales, librosIniciales } from '@servicios/mock/datos'
import type { AnotacionDTO, ComentarioDTO, EjemplarDTO, FiltroLibrosDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

/**
 * ============================================================================
 * LA BIBLIOTECA DE LUJO, EN PANTALLA (QA UX y BI de la ola de diseño)
 * ============================================================================
 * Pruebas de regresión que montan las pantallas reales con los servicios
 * simulados. Cada una nombra el hallazgo que cierra.
 */

jest.mock('@servicios/bibliotecaService')
const mockNavegar = jest.fn()
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavegar, goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}))

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const LIBROS = librosIniciales()
const { estantes, items } = estantesIniciales()
const porId = (id: string) => LIBROS.find((l) => l.id === id) as EjemplarDTO
const soloLibros = LIBROS.filter((l) => l.tipo === 'LIBRO')
const pagina = (list: EjemplarDTO[], total = list.length, totalPage = 1, page = 0) =>
  ok({ page, size: 30, totalPage, totalElements: total, list })

const mockLibros = librosService as jest.Mocked<typeof librosService>
const mockEstantes = estantesService as jest.Mocked<typeof estantesService>
const mockComentarios = comentariosService as jest.Mocked<typeof comentariosService>

const conSesion = () =>
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

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

/** La navegación de la pantalla, con su `addListener('focus')` de verdad (BI-03). */
const navegacion = () => {
  const oyentes: (() => void)[] = []
  return {
    oyentes,
    nav: {
      navigate: mockNavegar,
      goBack: jest.fn(),
      canGoBack: () => true,
      addListener: (_e: string, f: () => void) => {
        oyentes.push(f)
        return () => undefined
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- las pantallas reciben las props de react-navigation
    } as any,
  }
}

const porPestana = (f: FiltroLibrosDTO) => {
  const p = f.pestana ?? 'TODO'
  if (p === 'LEYENDO') return pagina(soloLibros.filter((l) => l.estado === 'LEYENDO'))
  if (p === 'DESEOS') return pagina(LIBROS.filter((l) => l.tipo === 'DESEO'))
  if (p === 'DOCUMENTOS') return pagina(LIBROS.filter((l) => l.tipo === 'DOCUMENTO'))
  if (f.texto === 'zzz') return pagina([])
  return pagina(soloLibros)
}

beforeEach(() => {
  jest.clearAllMocks()
  conSesion()
  mockLibros.todos.mockImplementation(async (f) => porPestana(f))
  mockLibros.detalle.mockImplementation(async (id) => ok({ ...porId(id), capitulos: CAPITULOS_DEMO, progreso: null }))
  mockLibros.guardar.mockImplementation(async (d) => ok({ ...porId(d.id), ...d } as EjemplarDTO))
  mockLibros.facetas.mockResolvedValue(ok({ autores: [], generos: [], anios: [], formatos: [], etiquetas: [] }))
  mockEstantes.todos.mockResolvedValue(ok(estantes))
  mockEstantes.libros.mockImplementation(async (id) => ok((items[id] ?? []).map(porId)))
  mockComentarios.todos.mockResolvedValue(ok([]))
  ;(anotacionesService.todas as jest.Mock).mockResolvedValue(ok([]))
  ;(vocesService.todas as jest.Mock).mockResolvedValue(ok(VOCES_DEMO))
  ;(progresoService.obtener as jest.Mock).mockResolvedValue(ok(null))
})

describe('El catálogo', () => {
  const alCatalogo = async () => {
    const { nav } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    fireEvent.press(r.getByTestId('vista-catalogo'))
    await waitFor(() => expect(r.getByTestId('pestana-TODO')).toBeTruthy())
    return r
  }

  it('UX-01/UX-04: «Todo» va primera y la pestaña activa se anuncia como seleccionada', async () => {
    const r = await alCatalogo()
    expect(r.getByTestId('pestana-TODO').props.accessibilityState.selected).toBe(true)
    expect(r.getByTestId('pestana-LEIDOS').props.accessibilityState.selected).toBe(false)
    expect(r.getByTestId('vista-catalogo').props.accessibilityState.checked).toBe(true)
  })

  it('UX-19: la pestaña Deseos cuenta deseos, no libros', async () => {
    const r = await alCatalogo()
    await act(async () => fireEvent.press(r.getByTestId('pestana-DESEOS')))
    const n = LIBROS.filter((l) => l.tipo === 'DESEO').length
    await waitFor(() => expect(r.getByText(n === 1 ? '1 deseo' : `${n} deseos`)).toBeTruthy())
  })

  it('UX-22: una búsqueda sin resultados lo dice y ofrece limpiarla', async () => {
    const r = await alCatalogo()
    fireEvent.changeText(r.getByTestId('buscar'), 'zzz')
    await waitFor(() => expect(r.getByText('Nada coincide con «zzz»')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('limpiar-busqueda')))
    await waitFor(() => expect(r.queryByText('Nada coincide con «zzz»')).toBeNull())
  })

  it('BI-13/BI-14: las facetas son las de la pestaña y se vuelven a pedir al abrir los filtros', async () => {
    const r = await alCatalogo()
    await act(async () => fireEvent.press(r.getByTestId('abrir-filtros')))
    await waitFor(() => expect(mockLibros.facetas).toHaveBeenCalledWith('TODO'))
  })
})

describe('La estantería', () => {
  it('BI-02: «Recién llegados» reúne libros aunque lo último que llegó sean documentos', async () => {
    const docs = Array.from({ length: 48 }, (_, i) => ({
      ...porId('ej-guardian'),
      id: `doc-${i}`,
      tipo: 'DOCUMENTO' as const,
    }))
    mockLibros.todos.mockImplementation(async (f) => {
      if (f.pestana === 'TODO' && f.page === 0) return pagina(docs, 48 + soloLibros.length, 2, 0)
      if (f.pestana === 'TODO' && f.page === 1) return pagina(soloLibros, 48 + soloLibros.length, 2, 1)
      if (f.pestana === 'DOCUMENTOS') return pagina(docs.slice(0, 1), 48)
      return porPestana(f)
    })
    const { nav } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByLabelText(`Recién llegados, ${soloLibros.length} libros`)).toBeTruthy())
    expect(mockLibros.todos).toHaveBeenCalledWith(expect.objectContaining({ pestana: 'TODO', page: 1 }))
  })

  it('UX-08: la placa dice «N de M» y «Ver todos ›» abre el catálogo en ese orden', async () => {
    mockLibros.todos.mockImplementation(async (f) => (f.pestana === 'TODO' ? pagina(soloLibros, 40) : porPestana(f)))
    const { nav } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByLabelText(`Recién llegados, ${soloLibros.length} de 40`)).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('ver-todos-recientes')))
    await waitFor(() => expect(r.getByTestId('pestana-TODO').props.accessibilityState.selected).toBe(true))
  })

  it('BI-03: al volver a la pantalla (foco) la estantería se pone al día', async () => {
    const { nav, oyentes } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByTestId('estante-recientes')).toBeTruthy())
    const antes = mockEstantes.todos.mock.calls.length
    act(() => oyentes.forEach((f) => f())) // el primer foco es el de montar: no recarga
    act(() => oyentes.forEach((f) => f())) // volver de la ficha: recarga
    await waitFor(() => expect(mockEstantes.todos.mock.calls.length).toBe(antes + 1))
  })

  it('UX-25: «Leyendo ahora» vacío se pliega a una línea con un botón', async () => {
    mockLibros.todos.mockImplementation(async (f) => (f.pestana === 'LEYENDO' ? pagina([]) : porPestana(f)))
    const { nav } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await waitFor(() => expect(r.getByText('Nada en el atril todavía.')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByText('Elegir un libro')))
    await waitFor(() => expect(r.getByTestId('pestana-POR_LEER').props.accessibilityState.selected).toBe(true))
  })
})

describe('Tus colecciones (BI-04)', () => {
  const abrir = async () => {
    const { nav } = navegacion()
    const r = render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, {
      wrapper: Envoltura,
    })
    await act(async () => fireEvent.press(r.getByTestId('abrir-colecciones')))
    await waitFor(() => expect(r.getByTestId('hoja-colecciones')).toBeTruthy())
    await waitFor(() => expect(r.getByTestId(`coleccion-${estantes[0].id}`)).toBeTruthy())
    return r
  }
  const coleccion = estantes.find((e) => e.tipo === 'COLECCION')!
  const favoritos = estantes.find((e) => e.tipo === 'FAVORITOS')!

  it('Favoritos se ve pero no se renombra ni se borra', async () => {
    const r = await abrir()
    expect(r.queryByTestId(`coleccion-renombrar-${favoritos.id}`)).toBeNull()
    expect(r.queryByTestId(`coleccion-borrar-${favoritos.id}`)).toBeNull()
    expect(r.getByTestId(`coleccion-renombrar-${coleccion.id}`)).toBeTruthy()
  })

  it('crea una colección con su nombre y su madera', async () => {
    mockEstantes.guardar.mockResolvedValue(
      ok({ id: 'nueva', nombre: 'Viaje', tipo: 'COLECCION', colorMadera: '#4A2E1C', nLibros: 0 }),
    )
    const r = await abrir()
    fireEvent.changeText(r.getByTestId('coleccion-nueva'), '  Viaje ')
    fireEvent.press(r.getByLabelText('Nogal'))
    await act(async () => fireEvent.press(r.getByTestId('coleccion-crear')))
    expect(mockEstantes.guardar).toHaveBeenCalledWith({ nombre: 'Viaje', colorMadera: '#4A2E1C' })
  })

  it('renombra y retira (con confirmación) una colección propia', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.[1]?.onPress?.())
    mockEstantes.guardar.mockResolvedValue(ok({ ...coleccion, nombre: 'Versos' }))
    mockEstantes.borrar.mockResolvedValue(ok(true))
    const r = await abrir()
    fireEvent.press(r.getByTestId(`coleccion-renombrar-${coleccion.id}`))
    fireEvent.changeText(r.getByTestId(`coleccion-nombre-${coleccion.id}`), 'Versos')
    await act(async () => fireEvent.press(r.getByTestId(`coleccion-guardar-${coleccion.id}`)))
    expect(mockEstantes.guardar).toHaveBeenCalledWith({
      id: coleccion.id,
      nombre: 'Versos',
      colorMadera: coleccion.colorMadera,
    })
    await act(async () => fireEvent.press(r.getByTestId(`coleccion-borrar-${coleccion.id}`)))
    expect(alerta).toHaveBeenCalledWith(
      'Retirar la colección',
      expect.stringContaining('siguen en tu biblioteca'),
      expect.any(Array),
    )
    await waitFor(() => expect(mockEstantes.borrar).toHaveBeenCalledWith(coleccion.id))
    alerta.mockRestore()
  })
})

describe('La ficha', () => {
  it('BI-07: quitar la calificación manda null y, si el servidor no lo aplica, no dice «Guardado»', async () => {
    mockLibros.detalle.mockResolvedValue(
      ok({ ...porId('ej-guardian'), calificacion: 3, capitulos: [], progreso: null }),
    )
    mockLibros.guardar.mockResolvedValue(ok({ ...porId('ej-guardian'), calificacion: 3 }))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('quitar-calificacion')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('quitar-calificacion')))
    expect(mockLibros.guardar).toHaveBeenCalledWith({ id: 'ej-guardian', calificacion: null })
    expect(globalThis.__mockShowToast).toHaveBeenCalledWith('warning', MENSAJES.noSeAplico)
    expect(globalThis.__mockShowToast).not.toHaveBeenCalledWith('success', MENSAJES.calificacionQuitada)
  })

  it('UX-07: cada estrella es un objetivo; tocar la 4 da 4', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estrella-4')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('estrella-4')))
    expect(mockLibros.guardar).toHaveBeenCalledWith({ id: 'ej-guardian', calificacion: 4 })
  })

  it('BI-09: un segundo toque en ♥ mientras guarda no manda otra petición', async () => {
    let soltar: () => void = () => undefined
    mockLibros.guardar.mockImplementation(
      (d) =>
        new Promise((res) => {
          soltar = () => res(ok({ ...porId(d.id), ...d } as EjemplarDTO))
        }),
    )
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('favorito')).toBeTruthy())
    fireEvent.press(r.getByTestId('favorito'))
    fireEvent.press(r.getByTestId('favorito'))
    expect(mockLibros.guardar).toHaveBeenCalledTimes(1)
    await act(async () => soltar())
  })

  it('BI-01: el aviso de retirar dice la verdad (lo escrito se conserva)', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ficha-pestana-datos')).toBeTruthy())
    fireEvent.press(r.getByTestId('ficha-pestana-datos'))
    fireEvent.press(r.getByText('Retirar de la biblioteca'))
    expect(alerta).toHaveBeenCalledWith(
      'Retirar de la biblioteca',
      MENSAJES.retirarAviso(porId('ej-guardian').titulo),
      expect.any(Array),
    )
    expect(MENSAJES.retirarAviso('x')).toMatch(/reaparecen/)
    alerta.mockRestore()
  })

  it('BI-08: vaciar el año manda null', async () => {
    mockLibros.detalle.mockResolvedValue(ok({ ...porId('ej-guardian'), anio: 1949, capitulos: [], progreso: null }))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ficha-pestana-datos')).toBeTruthy())
    fireEvent.press(r.getByTestId('ficha-pestana-datos'))
    fireEvent.changeText(r.getByDisplayValue('1949'), '')
    await act(async () => fireEvent.press(r.getByTestId('guardar-datos')))
    expect(mockLibros.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 'ej-guardian', anio: null }))
  })

  it('BI-10/BI-11: el diario no duplica con doble toque y pone lo nuevo arriba', async () => {
    const viejo: ComentarioDTO = { id: 'c1', ejemplarId: 'ej-guardian', texto: 'uno', creado: '2026-11-01T10:00:00Z' }
    mockComentarios.todos.mockResolvedValue(ok([viejo]))
    let soltar: () => void = () => undefined
    mockComentarios.guardar.mockImplementation(
      (c) =>
        new Promise((res) => {
          soltar = () => res(ok({ id: 'c2', ejemplarId: c.ejemplarId, texto: c.texto, creado: '2026-11-10T10:00:00Z' }))
        }),
    )
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ficha-pestana-diario')).toBeTruthy())
    fireEvent.press(r.getByTestId('ficha-pestana-diario'))
    await waitFor(() => expect(r.getByText('uno')).toBeTruthy())
    fireEvent.changeText(r.getByTestId('diario-texto'), 'dos')
    fireEvent.press(r.getByTestId('diario-anotar'))
    fireEvent.press(r.getByTestId('diario-anotar'))
    expect(mockComentarios.guardar).toHaveBeenCalledTimes(1)
    await act(async () => soltar())
    await waitFor(() => expect(r.getByText('dos')).toBeTruthy())
    const textos = r.getAllByText(/^(uno|dos)$/).map((t) => t.props.children)
    expect(textos).toEqual(['dos', 'uno'])
  })

  it('BI-15: un deseo enseña su nota y ofrece «Ya lo tengo» y «Dónde conseguirlo»', async () => {
    mockLibros.detalle.mockResolvedValue(
      ok({
        ...porId('ej-deseo-1'),
        nota: 'Regalo de cumpleaños',
        isbn: '9788437604947',
        capitulos: [],
        progreso: null,
      }),
    )
    const r = render(<FichaLibro ejemplarId="ej-deseo-1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('Regalo de cumpleaños')).toBeTruthy())
    expect(r.getByText(/ISBN 9788437604947/)).toBeTruthy()
    expect(r.getByTestId('donde-conseguirlo')).toBeTruthy()
    fireEvent.press(r.getByTestId('ya-lo-tengo'))
    await waitFor(() => expect(r.getByTestId('hoja-subir')).toBeTruthy())
  })

  it('UX-28: el estado es un segmentado de cuatro, uno marcado', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estado-LEIDO')).toBeTruthy())
    const marcados = ['POR_LEER', 'LEYENDO', 'LEIDO', 'ABANDONADO'].filter(
      (e) => r.getByTestId(`estado-${e}`).props.accessibilityState.checked,
    )
    expect(marcados).toEqual([porId('ej-guardian').estado])
  })
})

describe('El registro cerrado (contrato v1.2)', () => {
  it('si el servidor dice 403, se explica y no se ofrece el botón', async () => {
    const register = jest.fn(async () => {
      throw Object.assign(new Error('El registro está cerrado'), { codigo: 403 })
    })
    jest.spyOn(Auth, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      loading: false,
      isAuthenticated: false,
      esAdmin: false,
      login: jest.fn(),
      register,
      logout: jest.fn(),
      updateUser: jest.fn(),
    })
    const { nav } = navegacion()
    const r = render(<RegisterScreen navigation={nav} route={{ key: 'r', name: 'Registro' }} />, { wrapper: Envoltura })
    fireEvent.changeText(r.getByTestId('registro-nombre'), 'Lectora')
    fireEvent.changeText(r.getByTestId('registro-correo'), 'lectora@casa.co')
    fireEvent.changeText(r.getByTestId('registro-alias'), 'lectora')
    fireEvent.changeText(r.getByTestId('registro-clave'), 'Clave12345')
    fireEvent.changeText(r.getByTestId('registro-confirmar'), 'Clave12345')
    await act(async () => fireEvent.press(r.getByTestId('registro-boton')))
    await waitFor(() => expect(r.getByTestId('registro-cerrado')).toBeTruthy())
    expect(r.getByText(MENSAJES.registroCerrado)).toBeTruthy()
    expect(r.queryByTestId('registro-boton')).toBeNull()
  })
})

describe('Mis notas, el cuaderno', () => {
  const cita = (o: Partial<AnotacionDTO>): AnotacionDTO => ({
    ejemplarId: 'ej-guardian',
    tipo: 'RESALTADO',
    color: '#D9A35B',
    cfi: null,
    fraseInicio: 'c001-s00004',
    offsetInicio: 0,
    fraseFin: null,
    offsetFin: null,
    versionTexto: 1,
    textoCitado: 'La lámpara de latón',
    prefijo: null,
    sufijo: null,
    nota: null,
    capitulo: 1,
    creado: '2026-11-10T10:00:00Z',
    ...o,
  })
  beforeEach(() => {
    mockLibros.todos.mockResolvedValue(pagina([porId('ej-guardian')]))
    ;(anotacionesService.todas as jest.Mock).mockResolvedValue(
      ok([
        cita({ id: 'n1' }),
        cita({ id: 'n2', tipo: 'NOTA', color: '#9DB89A', textoCitado: 'Otra cosa', nota: 'Releer' }),
      ]),
    )
  })

  it('agrupa por libro, filtra por tipo y busca sin tildes', async () => {
    const { nav } = navegacion()
    const r = render(<NotasScreen navigation={nav} route={{ key: 'n', name: 'Notas' }} />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('cuaderno-ej-guardian')).toBeTruthy())
    expect(r.getByText('2 notas en 1 libro')).toBeTruthy()
    fireEvent.press(r.getByTestId('tipo-NOTA'))
    expect(r.queryByTestId('cita-n1')).toBeNull()
    expect(r.getByTestId('cita-n2')).toBeTruthy()
    fireEvent.press(r.getByTestId('tipo-TODO'))
    fireEvent.changeText(r.getByTestId('buscar-notas'), 'LAMPARA')
    expect(r.getByTestId('cita-n1')).toBeTruthy()
    expect(r.queryByTestId('cita-n2')).toBeNull()
  })

  it('«Ir al lugar» abre el lector exactamente en la frase', async () => {
    const { nav } = navegacion()
    const r = render(<NotasScreen navigation={nav} route={{ key: 'n', name: 'Notas' }} />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ir-n1')).toBeTruthy())
    fireEvent.press(r.getByTestId('ir-n1'))
    expect(mockNavegar).toHaveBeenCalledWith('Leer', { id: 'ej-guardian', frase: 'c001-s00004' })
  })

  it('editar la nota la guarda en el servidor', async () => {
    ;(anotacionesService.guardar as jest.Mock).mockImplementation(async (a) => ok(a))
    const { nav } = navegacion()
    const r = render(<NotasScreen navigation={nav} route={{ key: 'n', name: 'Notas' }} />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('mas-n1')).toBeTruthy())
    expect(r.queryByTestId('nota-editar-n1')).toBeNull() // las acciones secundarias van en «⋯»
    fireEvent.press(r.getByTestId('mas-n1'))
    fireEvent.press(r.getByTestId('nota-editar-n1'))
    fireEvent.changeText(r.getByTestId('nota-edicion-n1'), 'Precioso')
    await act(async () => fireEvent.press(r.getByTestId('nota-guardar-n1')))
    expect(anotacionesService.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', nota: 'Precioso' }))
    await waitFor(() => expect(r.getByText('✎ Precioso')).toBeTruthy())
  })
})
