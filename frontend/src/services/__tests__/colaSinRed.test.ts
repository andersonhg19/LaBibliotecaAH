import { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { enviarLatidoLectura } from '@hooks/useLatidoLectura'
import api, {
  colaSinRed,
  fijarTokenEnMemoria,
  olvidarColaSinRed,
  olvidarConfirmacionDeSesion,
  registrarCierreDeSesion,
  vaciarColaSinRed,
} from '@servicios/api'

/*
 * COLA SIN RED (0.5.0, contrato C12): el progreso y los latidos que no llegan por falta de
 * red esperan en el dispositivo y salen al volver la red, sin duplicar ni pisar nada; y un
 * fallo de red nunca cierra la sesión.
 */

const B = '/BIBLIOTECA-SERVICE/biblioteca/v1'
let hayRed = false
let enviadas: { url: string; datos: unknown }[] = []

const responder = async (config: InternalAxiosRequestConfig) => {
  if (!hayRed) throw new AxiosError('Network Error', 'ERR_NETWORK', config)
  enviadas.push({ url: String(config.url), datos: JSON.parse(String(config.data ?? 'null')) })
  return { status: 200, statusText: '', data: { correct: true }, headers: {}, config }
}

const cierre = jest.fn()
const adaptadorAntes = api.defaults.adapter

beforeEach(() => {
  hayRed = false
  enviadas = []
  cierre.mockClear()
  olvidarColaSinRed()
  olvidarConfirmacionDeSesion()
  api.defaults.adapter = responder as never
  registrarCierreDeSesion(cierre)
  fijarTokenEnMemoria('token-valido')
})
afterEach(() => {
  api.defaults.adapter = adaptadorAntes
  registrarCierreDeSesion(null)
  fijarTokenEnMemoria(null)
})

const progreso = (ejemplarId: string, pos: number) =>
  api.post(`${B}/progreso/save`, { ejemplarId, posicionAudioSeg: pos }).catch(() => null)
const latido = (sesionId: string, segundos: number) =>
  api.post(`${B}/sesiones/latido`, { ejemplarId: 'e1', sesionId, segundos }).catch(() => null)

describe('C12 · cola sin red', () => {
  it('sin red: del progreso queda solo el último de cada libro; los latidos, todos; y no se cierra la sesión', async () => {
    await progreso('e1', 10)
    await progreso('e1', 20)
    await progreso('e2', 5)
    await latido('s1', 60)
    await latido('s1', 30)
    expect(colaSinRed().map((p) => p.clave ?? 'latido')).toEqual(['progreso:e1', 'progreso:e2', 'latido', 'latido'])
    expect(JSON.parse(colaSinRed()[0].datos).posicionAudioSeg).toBe(20)
    expect(cierre).not.toHaveBeenCalled()
  })

  it('al volver la red sale todo en orden, una vez, y la cola queda vacía', async () => {
    await progreso('e1', 20)
    await latido('s1', 60)
    hayRed = true
    await vaciarColaSinRed()
    expect(enviadas.map((e) => e.url)).toEqual([`${B}/progreso/save`, `${B}/sesiones/latido`])
    expect(colaSinRed()).toEqual([])
    await vaciarColaSinRed()
    expect(enviadas).toHaveLength(2)
  })

  it('si sigue sin red al vaciar, no se pierde nada ni se duplica en la cola', async () => {
    await latido('s1', 60)
    await vaciarColaSinRed()
    expect(colaSinRed()).toHaveLength(1)
  })

  it('un progreso más nuevo que sí llega borra el viejo de la cola (nunca se pisa con uno viejo)', async () => {
    await progreso('e1', 20)
    hayRed = true
    await progreso('e1', 25)
    await vaciarColaSinRed()
    expect(enviadas.map((e) => (e.datos as { posicionAudioSeg: number }).posicionAudioSeg)).toEqual([25])
  })

  it('un timeout del latido no se encola (pudo llegar al servidor y contaría dos veces)', async () => {
    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config)
    }) as never
    await latido('s1', 60)
    expect(colaSinRed()).toEqual([])
  })

  it('el diario y las lecturas no van a esta cola', async () => {
    await api.post(`${B}/diario`, { eventos: [] }).catch(() => null)
    await api.post(`${B}/libros/get/e1`).catch(() => null)
    expect(colaSinRed()).toEqual([])
  })

  it('el latido del lector «al salir» sin red va por la vía normal (la que se encola)', () => {
    const enviar = jest.fn()
    const d = { ejemplarId: 'e1', modo: 'LECTURA' as const, capitulo: 0, posicion: 0, segundos: 30, alSalir: true }
    enviarLatidoLectura(d, () => false, enviar)
    expect(enviar.mock.calls[0][0].alSalir).toBeUndefined()
    enviarLatidoLectura(d, () => true, enviar)
    expect(enviar.mock.calls[1][0].alSalir).toBe(true)
  })
})
