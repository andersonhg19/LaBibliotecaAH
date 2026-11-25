import React from 'react'

import { Dimensions } from 'react-native'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { etiquetaLibro } from '@componentes/estanteria/tiposLibro'
import MarcaSinConexion from '@componentes/molecules/MarcaSinConexion'
import SinConexionAjustes, { estadoDeCopia } from '@componentes/molecules/SinConexionAjustes'
import { VOZ_POR_DEFECTO } from '@config'
import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import FichaLibro from '@pantallas/libro/FichaLibro'
import {
  anotacionesService,
  comentariosService,
  estantesService,
  librosService,
  preparacionService,
  progresoService,
  vocesService,
} from '@servicios/bibliotecaService'
import { CAPITULOS_DEMO, VOCES_DEMO, estantesIniciales, librosIniciales } from '@servicios/mock/datos'
import type { EjemplarDTO, FiltroLibrosDTO, ProgresoDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'
import {
  type ProgresoSinConexion,
  escucharSinConexion,
  guardarSinConexion,
  listarSinConexion,
  olvidarSinConexion,
  progresoSinConexion,
  sinConexionDisponible,
  sincronizarSinConexion,
} from '@utils/sinConexion'

/**
 * ============================================================================
 * 0.5.0 · «LEYENDO» MANDA (C10), SIN CONEXIÓN EN LA UI (C12) Y LIBROS «SOLO
 * REGISTRO» (C11)
 * ============================================================================
 * Anderson: «quitar un libro de la lista de en proceso», «cuando lo termino o
 * lo quito de esa lista se borren esas pistas», «no puede ser que no empiece a
 * leer hasta que no estén todas las pistas» y «solo quiero tener la lista de
 * todo lo que he leído». `sinConexion` es el contrato con la ola de voz: aquí
 * se simula; `/libros/registro` lo crea la ola de backend: aquí se simula.
 */

jest.mock('@servicios/bibliotecaService')
jest.mock('@utils/sinConexion')
/* El motor de audio es de la ola de voz: aquí solo importa que se pida escuchar. */
jest.mock('@utils/escuchar')
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
const pagina = (list: EjemplarDTO[]) => ok({ page: 0, size: 30, totalPage: 1, totalElements: list.length, list })
const showToast = (globalThis as unknown as { __mockShowToast: jest.Mock }).__mockShowToast

const mLibros = librosService as jest.Mocked<typeof librosService>
const mPrep = preparacionService as jest.Mocked<typeof preparacionService>
const mSincronizar = sincronizarSinConexion as jest.MockedFunction<typeof sincronizarSinConexion>
const mGuardarCopia = guardarSinConexion as jest.MockedFunction<typeof guardarSinConexion>
const mProgresoCopia = progresoSinConexion as jest.MockedFunction<typeof progresoSinConexion>
const mEscuchar = escucharSinConexion as jest.MockedFunction<typeof escucharSinConexion>
const mListar = listarSinConexion as jest.MockedFunction<typeof listarSinConexion>
const mOlvidar = olvidarSinConexion as jest.MockedFunction<typeof olvidarSinConexion>
const mDisponible = sinConexionDisponible as jest.MockedFunction<typeof sinConexionDisponible>

/** Los libros en «Leyendo» del servidor de mentira (cambian al guardar un estado). */
let estados: Record<string, EjemplarDTO['estado']> = {}
const conEstado = (l: EjemplarDTO) => ({ ...l, estado: estados[l.id] ?? l.estado })
const leyendo = () => soloLibros.map(conEstado).filter((l) => l.estado === 'LEYENDO')

const responder = (f: FiltroLibrosDTO) => {
  if (f.pestana === 'LEYENDO') return pagina(leyendo())
  return pagina(soloLibros.map(conEstado))
}

const copia = (o: Partial<ProgresoSinConexion>): ProgresoSinConexion => ({
  ejemplarId: 'ej-guardian',
  estado: 'ninguno',
  total: 0,
  guardados: 0,
  bytes: 0,
  mensaje: '',
  ...o,
})

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const montarBiblioteca = () => {
  const nav = {
    navigate: mockNavegar,
    goBack: jest.fn(),
    canGoBack: () => true,
    addListener: () => () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- las pantallas reciben las props de react-navigation
  } as any
  return render(<BibliotecaScreen navigation={nav} route={{ key: 'b', name: 'Biblioteca' }} />, { wrapper: Envoltura })
}

/** Deja correr lo de segundo plano. */
const vaciar = () => act(async () => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  jest.clearAllMocks()
  estados = {}
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
  mLibros.todos.mockImplementation(async (f) => responder(f))
  mLibros.detalle.mockImplementation(async (id) =>
    ok({ ...conEstado(porId(id)), capitulos: CAPITULOS_DEMO, progreso: null }),
  )
  mLibros.guardar.mockImplementation(async (d) => {
    if (d.estado) estados[d.id] = d.estado
    return ok({ ...conEstado(porId(d.id)), ...d } as EjemplarDTO)
  })
  mLibros.facetas.mockResolvedValue(ok({ autores: [], generos: [], anios: [], formatos: [], etiquetas: [] }))
  ;(estantesService.todos as jest.Mock).mockResolvedValue(ok(estantes))
  ;(estantesService.libros as jest.Mock).mockImplementation(async (id: string) => ok((items[id] ?? []).map(porId)))
  ;(comentariosService.todos as jest.Mock).mockResolvedValue(ok([]))
  ;(anotacionesService.todas as jest.Mock).mockResolvedValue(ok([]))
  ;(vocesService.todas as jest.Mock).mockResolvedValue(ok(VOCES_DEMO))
  ;(progresoService.obtener as jest.Mock).mockResolvedValue(ok(null))
  mPrep.preparar.mockResolvedValue(ok(true))
  mPrep.estado.mockResolvedValue(ok({ total: 0, listos: 0, enCola: 0, error: 0 } as never))
  mEscuchar.mockReturnValue(() => undefined)
  mProgresoCopia.mockImplementation(async (id) => copia({ ejemplarId: id }))
  mListar.mockResolvedValue([])
  mDisponible.mockReturnValue(true)
})

describe('C10.3 · al abrir la app, las copias se ajustan a «Leyendo»', () => {
  it('la estantería, al cargar el atril, sincroniza con los libros en «Leyendo» (en segundo plano)', async () => {
    const r = montarBiblioteca()
    await waitFor(() => expect(r.getByTestId('estante-leyendo')).toBeTruthy())
    await vaciar()
    expect(mSincronizar).toHaveBeenCalledWith(leyendo().map((l) => ({ id: l.id })))
  })
})

describe('C10.4 · «Quitar de En proceso» desde el atril de la estantería', () => {
  const alAtril = async () => {
    const r = montarBiblioteca()
    await waitFor(() => expect(r.getByTestId('atril-opciones-ej-guardian')).toBeTruthy())
    return r
  }

  it('cada libro del atril lleva un «⋯» con nombre que abre la hoja con las tres salidas', async () => {
    const r = await alAtril()
    expect(r.getByLabelText(`Quitar «${porId('ej-guardian').titulo}» de Leyendo`)).toBeTruthy()
    await act(async () => fireEvent.press(r.getByTestId('atril-opciones-ej-guardian')))
    expect(r.getByTestId('hoja-quitar-leyendo')).toBeTruthy()
    expect(r.getByText('Lo dejo para después')).toBeTruthy()
    expect(r.getByText('Lo abandoné')).toBeTruthy()
    expect(r.getByText('Ya lo terminé')).toBeTruthy()
  })

  it('«Ya lo terminé»: se guarda como Leído con el save de siempre, sale del atril, se celebra y se sincroniza', async () => {
    const r = await alAtril()
    await act(async () => fireEvent.press(r.getByTestId('atril-opciones-ej-guardian')))
    mSincronizar.mockClear()
    await act(async () => fireEvent.press(r.getByTestId('quitar-LEIDO')))
    expect(mLibros.guardar).toHaveBeenCalledWith({ id: 'ej-guardian', estado: 'LEIDO' })
    await waitFor(() => expect(r.queryByTestId('atril-opciones-ej-guardian')).toBeNull())
    expect(r.getByTestId('aviso-deshacer')).toBeTruthy()
    expect(r.getByText(MENSAJES.quitadoDeLeyendo(porId('ej-guardian').titulo, 'leído'))).toBeTruthy()
    await vaciar()
    /* La lista nueva de «Leyendo» ya no lo tiene: su copia del dispositivo se borra. */
    expect(mSincronizar).toHaveBeenCalled()
    for (const [lista] of mSincronizar.mock.calls) expect(lista.map((x) => x.id)).not.toContain('ej-guardian')
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', '¡Libro terminado!', expect.stringContaining('«')),
    )
  })

  it('«Deshacer» lo devuelve a «Leyendo» y vuelve a pedir su voz y su copia', async () => {
    const r = await alAtril()
    await act(async () => fireEvent.press(r.getByTestId('atril-opciones-ej-guardian')))
    await act(async () => fireEvent.press(r.getByTestId('quitar-ABANDONADO')))
    expect(mLibros.guardar).toHaveBeenCalledWith({ id: 'ej-guardian', estado: 'ABANDONADO' })
    await act(async () => fireEvent.press(r.getByTestId('deshacer-quitar')))
    expect(mLibros.guardar).toHaveBeenLastCalledWith({ id: 'ej-guardian', estado: 'LEYENDO' })
    await waitFor(() => expect(r.getByTestId('atril-opciones-ej-guardian')).toBeTruthy())
    await vaciar()
    expect(mPrep.preparar).toHaveBeenCalledWith('ej-guardian', VOZ_POR_DEFECTO, undefined)
    expect(mGuardarCopia).toHaveBeenCalledWith('ej-guardian')
    expect(r.queryByTestId('aviso-deshacer')).toBeNull()
  })

  it('si el servidor no lo guarda, se dice y el libro sigue en el atril', async () => {
    mLibros.guardar.mockResolvedValueOnce({ correct: false, message: 'mal', errorCode: 500, object: null as never })
    const r = await alAtril()
    await act(async () => fireEvent.press(r.getByTestId('atril-opciones-ej-guardian')))
    await act(async () => fireEvent.press(r.getByTestId('quitar-POR_LEER')))
    expect(showToast).toHaveBeenCalledWith('error', MENSAJES.errorGuardar, expect.anything())
    expect(r.getByTestId('hoja-quitar-leyendo')).toBeTruthy()
    expect(r.queryByTestId('aviso-deshacer')).toBeNull()
  })

  it('C12: bajo el libro, la marca discreta «Guardando 12/40» o «Sin conexión ✓»', async () => {
    mProgresoCopia.mockImplementation(async (id) =>
      id === 'ej-guardian'
        ? copia({ ejemplarId: id, estado: 'descargando', total: 40, guardados: 12 })
        : copia({ ejemplarId: id, estado: 'completo', total: 9, guardados: 9 }),
    )
    const r = await alAtril()
    await waitFor(() => expect(r.getByText('Guardando 12/40')).toBeTruthy())
    expect(r.getAllByText('Sin conexión ✓').length).toBeGreaterThan(0)
    expect(r.getByLabelText('Guardando para escuchar sin conexión: 12 de 40 capítulos')).toBeTruthy()
  })
})

describe('C10.4 · «Quitar de En proceso» desde la pestaña Leyendo del catálogo', () => {
  it('en lista y en rejilla, cada libro en Leyendo tiene su «⋯» (fuera del botón de la ficha); otros no', async () => {
    const r = montarBiblioteca()
    fireEvent.press(r.getByTestId('vista-catalogo'))
    await waitFor(() => expect(r.getByTestId('pestana-LEYENDO')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('pestana-LEYENDO')))
    await waitFor(() => expect(r.getByTestId('catalogo-opciones-ej-quijote')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('pestana-TODO')))
    await waitFor(() => expect(r.getByTestId('catalogo-ej-platero')).toBeTruthy())
    expect(r.queryByTestId('catalogo-opciones-ej-platero')).toBeNull()
    expect(r.getByTestId('catalogo-opciones-ej-quijote')).toBeTruthy()
  })

  it('«Lo dejo para después» lo pasa a Por leer y la lista se vuelve a pedir', async () => {
    const r = montarBiblioteca()
    fireEvent.press(r.getByTestId('vista-catalogo'))
    await waitFor(() => expect(r.getByTestId('pestana-LEYENDO')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('pestana-LEYENDO')))
    await waitFor(() => expect(r.getByTestId('catalogo-opciones-ej-quijote')).toBeTruthy())
    const antes = mLibros.todos.mock.calls.length
    await act(async () => fireEvent.press(r.getByTestId('catalogo-opciones-ej-quijote')))
    await act(async () => fireEvent.press(r.getByTestId('quitar-POR_LEER')))
    expect(mLibros.guardar).toHaveBeenCalledWith({ id: 'ej-quijote', estado: 'POR_LEER' })
    await waitFor(() => expect(r.queryByTestId('catalogo-ej-quijote')).toBeNull())
    expect(mLibros.todos.mock.calls.length).toBeGreaterThan(antes)
    expect(r.getByTestId('aviso-deshacer')).toBeTruthy()
  })
})

describe('C10.3 · la ficha: al pasar a «Leyendo» se prepara en segundo plano', () => {
  it('con la voz elegida y desde el capítulo por donde vas; y se guarda la copia y se sincroniza', async () => {
    const progreso = { capitulo: 4 } as ProgresoDTO
    mLibros.detalle.mockResolvedValue(ok({ ...porId('ej-regenta'), capitulos: CAPITULOS_DEMO, progreso }))
    const r = render(<FichaLibro ejemplarId="ej-regenta" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estado-LEYENDO')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('estado-LEYENDO')))
    expect(mLibros.guardar).toHaveBeenCalledWith({ id: 'ej-regenta', estado: 'LEYENDO' })
    await vaciar()
    expect(mPrep.preparar).toHaveBeenCalledWith('ej-regenta', VOZ_POR_DEFECTO, 4)
    expect(mGuardarCopia).toHaveBeenCalledWith('ej-regenta')
    expect(mSincronizar).toHaveBeenCalled()
  })

  it('al sacarlo de «Leyendo» no se prepara nada, pero las copias se ajustan (la suya se borra)', async () => {
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estado-ABANDONADO')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('estado-ABANDONADO')))
    await vaciar()
    expect(mPrep.preparar).not.toHaveBeenCalled()
    expect(mSincronizar).toHaveBeenCalled()
    for (const [lista] of mSincronizar.mock.calls) expect(lista.map((x) => x.id)).not.toContain('ej-guardian')
  })

  it('empezar a escuchar un libro «Por leer» también pide su voz entera (sin esperar)', async () => {
    const r = render(<FichaLibro ejemplarId="ej-regenta" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('boton-escuchar')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('boton-escuchar')))
    await vaciar()
    expect(mPrep.preparar).toHaveBeenCalledWith('ej-regenta', VOZ_POR_DEFECTO, 0)
    expect(mockNavegar).toHaveBeenCalledWith('Escuchar', { id: 'ej-regenta' })
  })

  it('en «Leyendo», la ficha enseña la marca de la copia sin conexión', async () => {
    mProgresoCopia.mockResolvedValue(copia({ estado: 'completo', total: 12, guardados: 12 }))
    const r = render(<FichaLibro ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('Sin conexión ✓')).toBeTruthy())
    expect(r.getByLabelText('Disponible para escuchar sin conexión')).toBeTruthy()
  })
})

describe('C11 · un libro «solo registro» en la ficha y en las listas', () => {
  const REGISTRO: EjemplarDTO = {
    ...porId('ej-platero'),
    id: 'ej-registro',
    archivoId: null,
    tienePortada: false,
    estadoConversion: null,
    sinArchivo: true,
    nota: 'Me lo prestó Marta',
  }

  it('no ofrece Leer, Escuchar, índice, preparar ni pronunciación; explica «Solo registro»', async () => {
    mLibros.detalle.mockResolvedValue(ok({ ...REGISTRO, capitulos: [], progreso: null }))
    const r = render(<FichaLibro ejemplarId="ej-registro" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('solo-registro')).toBeTruthy())
    expect(r.getByText(MENSAJES.soloRegistro)).toBeTruthy()
    expect(r.getByText('Me lo prestó Marta')).toBeTruthy()
    expect(r.queryByTestId('boton-leer')).toBeNull()
    expect(r.queryByTestId('boton-escuchar')).toBeNull()
    expect(r.queryByTestId('barra-acciones-ficha')).toBeNull()
    expect(r.queryByTestId('ficha-pestana-capitulos')).toBeNull()
    expect(r.queryByTestId('ficha-pestana-notas')).toBeNull()
    expect(r.queryByTestId('preparar-libro')).toBeNull()
    /* Lo que sí: el estado, las estrellas, el diario y los datos. */
    expect(r.getByTestId('estado-LEIDO')).toBeTruthy()
    expect(r.getByTestId('ficha-pestana-diario').props.accessibilityState.selected).toBe(true)
    expect(r.getByTestId('ficha-pestana-datos')).toBeTruthy()
  })

  it('ponerlo en «Leyendo» (para el registro) no pide voz ni copia', async () => {
    mLibros.detalle.mockResolvedValue(ok({ ...REGISTRO, capitulos: [], progreso: null }))
    mLibros.guardar.mockImplementation(async (d) => ok({ ...REGISTRO, ...d } as EjemplarDTO))
    const r = render(<FichaLibro ejemplarId="ej-registro" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('estado-LEYENDO')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('estado-LEYENDO')))
    await vaciar()
    expect(mPrep.preparar).not.toHaveBeenCalled()
    expect(mGuardarCopia).not.toHaveBeenCalled()
  })

  it('un deseo (que el servidor también marca sinArchivo) sigue siendo un deseo, no «solo registro»', async () => {
    mLibros.detalle.mockResolvedValue(ok({ ...porId('ej-deseo-1'), sinArchivo: true, capitulos: [], progreso: null }))
    const r = render(<FichaLibro ejemplarId="ej-deseo-1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('ya-lo-tengo')).toBeTruthy())
    expect(r.queryByTestId('solo-registro')).toBeNull()
  })

  it('en las listas se anuncia como «solo registro» (y su portada es la generada, sin archivo)', () => {
    expect(etiquetaLibro(REGISTRO)).toContain('(solo registro)')
  })
})

describe('C11 · «Apuntar un libro que ya leí» desde el «+»', () => {
  const alFormulario = async () => {
    const r = montarBiblioteca()
    await waitFor(() => expect(r.getByTestId('estante-leyendo')).toBeTruthy())
    await act(async () => fireEvent.press(r.getAllByTestId('traer-libros')[0]))
    await act(async () => fireEvent.press(r.getByTestId('ir-apuntar')))
    await waitFor(() => expect(r.getByTestId('hoja-apuntar')).toBeTruthy())
    return r
  }

  it('el «+» ofrece, discreto al pie, apuntar sin archivo; abre la hoja con Leído elegido', async () => {
    const r = await alFormulario()
    expect(r.getByTestId('apuntar-estado-LEIDO').props.accessibilityState.checked).toBe(true)
    expect(r.getByTestId('apuntar-fecha')).toBeTruthy()
  })

  it('sin título no se manda nada y se dice', async () => {
    const r = await alFormulario()
    await act(async () => fireEvent.press(r.getByTestId('apuntar-guardar')))
    expect(r.getByText(/El título es obligatorio/)).toBeTruthy()
    expect(mLibros.registro).not.toHaveBeenCalled()
  })

  it('manda POST /v1/libros/registro con lo escrito y avisa', async () => {
    mLibros.registro.mockImplementation(async (d) =>
      ok({ ...porId('ej-platero'), id: 'nuevo', titulo: d.titulo, archivoId: null, sinArchivo: true }),
    )
    const r = await alFormulario()
    fireEvent.changeText(r.getByTestId('apuntar-titulo'), 'Rayuela')
    fireEvent.changeText(r.getByTestId('apuntar-autores'), 'Julio Cortázar')
    fireEvent.changeText(r.getByTestId('apuntar-fecha'), '01/06/2020')
    await act(async () => fireEvent.press(r.getByTestId('apuntar-guardar')))
    expect(mLibros.registro).toHaveBeenCalledWith({
      titulo: 'Rayuela',
      autores: ['Julio Cortázar'],
      estado: 'LEIDO',
      fechaFin: '2020-06-01T00:00:00Z',
      calificacion: null,
      nota: null,
    })
    expect(showToast).toHaveBeenCalledWith('success', MENSAJES.registroGuardado, 'Rayuela')
    await waitFor(() => expect(r.queryByTestId('hoja-apuntar')).toBeNull())
  })

  it('solo «Leído» pide fecha de fin', async () => {
    const r = await alFormulario()
    await act(async () => fireEvent.press(r.getByTestId('apuntar-estado-POR_LEER')))
    expect(r.queryByTestId('apuntar-fecha')).toBeNull()
    await act(async () => fireEvent.press(r.getByTestId('apuntar-estado-ABANDONADO')))
    expect(r.queryByTestId('apuntar-fecha')).toBeNull()
  })

  it('si el servidor lo rechaza (errorCode 120) se enseña su mensaje y la hoja sigue abierta', async () => {
    const msg = 'La fecha de fin solo vale para un libro leído y no puede ser futura.'
    mLibros.registro.mockResolvedValue({ correct: false, message: msg, errorCode: 120, object: null as never })
    const r = await alFormulario()
    fireEvent.changeText(r.getByTestId('apuntar-titulo'), 'Rayuela')
    await act(async () => fireEvent.press(r.getByTestId('apuntar-guardar')))
    expect(showToast).toHaveBeenCalledWith('error', MENSAJES.errorGuardar, msg)
    expect(r.getByTestId('hoja-apuntar')).toBeTruthy()
  })

  it('también desde el menú «⋯» de la biblioteca en el teléfono', async () => {
    const ventana = Dimensions.get('window')
    act(() =>
      Dimensions.set({
        window: { ...ventana, width: 390, height: 844 },
        screen: { ...ventana, width: 390, height: 844 },
      }),
    )
    const r = montarBiblioteca()
    await waitFor(() => expect(r.getByTestId('menu-biblioteca')).toBeTruthy())
    await act(async () => fireEvent.press(r.getByTestId('menu-biblioteca')))
    await act(async () => fireEvent.press(r.getByTestId('menu-apuntar')))
    await waitFor(() => expect(r.getByTestId('hoja-apuntar')).toBeTruthy())
    /* En el teléfono el atril también lleva su «⋯». */
    await waitFor(() => expect(r.getByTestId('atril-opciones-ej-guardian')).toBeTruthy())
    act(() => Dimensions.set({ window: ventana, screen: ventana }))
  })
})

describe('C12 · Ajustes › Sin conexión', () => {
  it('si el navegador no puede guardar, una línea explica que hay que añadir la app a la pantalla de inicio', async () => {
    mDisponible.mockReturnValue(false)
    const r = render(<SinConexionAjustes />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('sin-conexion-no-disponible')).toBeTruthy())
    expect(r.getByText(MENSAJES.sinConexionNoDisponible)).toBeTruthy()
  })

  it('sin copias, dice cuándo aparecerán', async () => {
    const r = render(<SinConexionAjustes />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText(MENSAJES.sinConexionVacio)).toBeTruthy())
  })

  it('la lista con su título, el estado, lo que ocupa en total, y borrar una copia', async () => {
    mListar.mockResolvedValue([
      copia({ ejemplarId: 'ej-guardian', estado: 'completo', total: 12, guardados: 12, bytes: 30 * 1048576 }),
      copia({ ejemplarId: 'ej-quijote', estado: 'descargando', total: 40, guardados: 12, bytes: 10 * 1048576 }),
    ])
    mOlvidar.mockResolvedValue(undefined)
    const r = render(<SinConexionAjustes />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('sin-conexion-total')).toBeTruthy())
    expect(r.getByText('2 libros en este dispositivo · 40 MB')).toBeTruthy()
    await waitFor(() => expect(r.getByText(porId('ej-guardian').titulo)).toBeTruthy())
    expect(r.getByText('Completo · 12 capítulos · 30 MB')).toBeTruthy()
    expect(r.getByText('Guardando 12/40 · 10 MB')).toBeTruthy()
    mListar.mockResolvedValue([copia({ ejemplarId: 'ej-quijote', estado: 'descargando', total: 40, guardados: 12 })])
    await act(async () => fireEvent.press(r.getByTestId('borrar-copia-ej-guardian')))
    expect(mOlvidar).toHaveBeenCalledWith('ej-guardian')
    expect(showToast).toHaveBeenCalledWith('success', MENSAJES.sinConexionBorrada)
    await waitFor(() => expect(r.queryByTestId('borrar-copia-ej-guardian')).toBeNull())
  })

  it('el estado de una copia dicho corto', () => {
    expect(estadoDeCopia(copia({ estado: 'error' }))).toBe('Falló; se reintenta solo')
    expect(estadoDeCopia(copia({ estado: 'completo', total: 1 }))).toBe('Completo · 1 capítulo')
  })

  it('la marca no ocupa nada si no hay copia', async () => {
    const r = render(<MarcaSinConexion ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await vaciar()
    expect(r.queryByTestId('sin-conexion-ej-guardian')).toBeNull()
  })

  it('la marca se pone al día con los avisos del gestor de copias', async () => {
    let avisar: (p: ProgresoSinConexion) => void = () => undefined
    mEscuchar.mockImplementation((fn) => {
      avisar = fn
      return () => undefined
    })
    const r = render(<MarcaSinConexion ejemplarId="ej-guardian" />, { wrapper: Envoltura })
    await vaciar()
    await act(async () => avisar(copia({ estado: 'descargando', total: 5, guardados: 2 })))
    expect(r.getByText('Guardando 2/5')).toBeTruthy()
    await act(async () => avisar(copia({ ejemplarId: 'otro', estado: 'completo' })))
    expect(r.getByText('Guardando 2/5')).toBeTruthy()
    await act(async () => avisar(copia({ estado: 'completo', total: 5, guardados: 5 })))
    expect(r.getByText('Sin conexión ✓')).toBeTruthy()
  })
})
