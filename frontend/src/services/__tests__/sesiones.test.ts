import { INACTIVIDAD_MS, Latidor } from '@hooks/useLatidoLectura'
import api from '@servicios/api'
import {
  cuerpoLatido,
  enviarLatido,
  nuevaSesionId,
  obtenerResumen,
  reiniciarSesiones,
} from '@servicios/sesionesService'

/*
 * C4 · SESIONES DE LECTURA (contrato C4, casos G5 del lado del cliente y F12):
 * qué se manda, cuándo se manda y que un fallo nunca estorba a la lectura.
 */

jest.mock('@servicios/api', () => {
  const real = jest.requireActual('@servicios/api')
  return { __esModule: true, ...real, default: { post: jest.fn(), get: jest.fn() }, tokenActual: () => 'tok' }
})
const mockApi = api as unknown as { post: jest.Mock; get: jest.Mock }

beforeEach(() => {
  mockApi.post.mockReset()
  mockApi.get.mockReset()
  reiniciarSesiones()
})

describe('cuerpo del latido', () => {
  it('acota segundos a 0..120 enteros, la posición a 0..1 y el capítulo a entero ≥ 0', () => {
    expect(cuerpoLatido({ ejemplarId: 'e', modo: 'LECTURA', capitulo: -2, posicion: 1.4, segundos: 300.6 })).toEqual({
      ejemplarId: 'e',
      modo: 'LECTURA',
      capitulo: 0,
      posicion: 1,
      segundos: 120,
    })
    expect(cuerpoLatido({ ejemplarId: 'e', modo: 'VOZ', capitulo: 3.7, posicion: NaN, segundos: -5 })).toEqual({
      ejemplarId: 'e',
      modo: 'VOZ',
      capitulo: 3,
      posicion: 0,
      segundos: 0,
    })
  })
  it('un sesionId con forma de uuid v4, distinto cada vez', () => {
    const a = nuevaSesionId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(nuevaSesionId()).not.toBe(a)
  })
})

describe('enviarLatido', () => {
  const datos = { ejemplarId: 'e1', modo: 'LECTURA' as const, sesionId: 's1', capitulo: 2, posicion: 0.3, segundos: 60 }
  it('POST a /sesiones/latido con el cuerpo del contrato', async () => {
    mockApi.post.mockResolvedValue({ data: { correct: true, object: { sesionId: 's1', segundosTotales: 60 } } })
    const r = await enviarLatido(datos)
    expect(mockApi.post).toHaveBeenCalledWith('/BIBLIOTECA-SERVICE/biblioteca/v1/sesiones/latido', datos)
    expect(r?.object.segundosTotales).toBe(60)
  })
  it('un error de red no lanza; un 404 (servidor 0.3.3) hace que deje de insistir', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockApi.post.mockRejectedValueOnce(new Error('Network Error'))
    await expect(enviarLatido(datos)).resolves.toBeNull()
    mockApi.post.mockRejectedValueOnce({ response: { status: 404 } })
    await expect(enviarLatido(datos)).resolves.toBeNull()
    await enviarLatido(datos)
    expect(mockApi.post).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('al salir va por fetch keepalive con el token (no por axios)', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true })
    const antes = global.fetch
    global.fetch = f as unknown as typeof fetch
    await enviarLatido({ ...datos, alSalir: true })
    expect(mockApi.post).not.toHaveBeenCalled()
    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/\/BIBLIOTECA-SERVICE\/biblioteca\/v1\/sesiones\/latido$/)
    expect(init.keepalive).toBe(true)
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual(datos)
    global.fetch = antes
  })
})

describe('obtenerResumen', () => {
  it('GET /sesiones/resumen con desde y hasta', async () => {
    mockApi.get.mockResolvedValue({ data: { correct: true, object: { minutosLectura: 3 } } })
    const r = await obtenerResumen('2026-11-01', '2026-11-14')
    expect(mockApi.get).toHaveBeenCalledWith('/BIBLIOTECA-SERVICE/biblioteca/v1/sesiones/resumen', {
      params: { desde: '2026-11-01', hasta: '2026-11-14' },
    })
    expect(r.object.minutosLectura).toBe(3)
  })
})

describe('Latidor (el latido del lector)', () => {
  const montar = () => {
    let t = 1_000_000
    const enviar = jest.fn()
    let pos: { capitulo: number; posicion: number } | null = { capitulo: 4, posicion: 0.5 }
    const l = new Latidor({
      ejemplarId: 'e1',
      enviar,
      ahora: () => t,
      posicion: () => pos,
      sesionId: 's1',
      dispositivo: 'iPhone',
    })
    return {
      l,
      enviar,
      pasar: (ms: number) => (t += ms),
      ponerPos: (p: typeof pos) => (pos = p),
    }
  }
  it('cada minuto con actividad manda 60 s de LECTURA con su sesión y posición', () => {
    const { l, enviar, pasar } = montar()
    pasar(60_000)
    expect(l.tic(true)).toBe(60)
    expect(enviar).toHaveBeenCalledWith({
      ejemplarId: 'e1',
      modo: 'LECTURA',
      sesionId: 's1',
      capitulo: 4,
      posicion: 0.5,
      segundos: 60,
      dispositivo: 'iPhone',
    })
  })
  it('sin tocar nada más de 2 min, deja de contar (y no recupera ese rato después)', () => {
    const { l, enviar, pasar } = montar()
    pasar(60_000)
    l.tic(true)
    pasar(60_000)
    l.tic(true) // 2 min desde el último toque: aún cuenta
    pasar(60_000)
    expect(l.tic(true)).toBe(0)
    pasar(60_000)
    expect(l.tic(true)).toBe(0)
    l.actividad()
    pasar(60_000)
    expect(l.tic(true)).toBe(60)
    expect(enviar).toHaveBeenCalledTimes(3)
    expect(INACTIVIDAD_MS).toBe(120_000)
  })
  it('con la página oculta no manda; al salir manda lo pendiente por keepalive', () => {
    const { l, enviar, pasar } = montar()
    pasar(30_000)
    expect(l.tic(false)).toBe(0)
    pasar(20_000)
    expect(l.tic(false, true)).toBe(20)
    expect(enviar.mock.calls[0][0]).toMatchObject({ segundos: 20, alSalir: true })
  })
  it('al volver a la página, lo de mientras estuvo oculta no cuenta', () => {
    const { l, pasar } = montar()
    pasar(600_000)
    l.reanudar()
    pasar(60_000)
    expect(l.tic(true)).toBe(60)
  })
  it('sin posición (la voz está leyendo este libro) no manda LECTURA', () => {
    const { l, enviar, pasar, ponerPos } = montar()
    ponerPos(null)
    pasar(60_000)
    expect(l.tic(true)).toBe(0)
    expect(enviar).not.toHaveBeenCalled()
  })
  it('nunca más de 120 s por latido', () => {
    const { l, pasar } = montar()
    pasar(90_000)
    l.actividad()
    pasar(90_000)
    expect(l.tic(true)).toBe(120)
  })
})
