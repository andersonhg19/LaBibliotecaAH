import { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import api, { fijarTokenEnMemoria, olvidarConfirmacionDeSesion, registrarCierreDeSesion } from '@servicios/api'

/*
 * V-NUEVO-2 (validación web 0.4.0): un 401 esporádico con un token válido
 * cerraba la sesión. Antes de cerrar se confirma con auth-service UNA vez.
 */

type Respuesta = number | 'sin-red'
let guion: Record<string, Respuesta[]> = {}
let llamadas: string[] = []

const responder = async (config: InternalAxiosRequestConfig) => {
  const ruta = String(config.url)
  const clave = Object.keys(guion).find((k) => ruta.endsWith(k)) ?? ruta
  llamadas.push(clave)
  const r = guion[clave]?.length ? (guion[clave].shift() as Respuesta) : 200
  if (r === 'sin-red') throw new AxiosError('Network Error', 'ERR_NETWORK', config)
  const response = { status: r, statusText: '', data: { correct: r === 200 }, headers: {}, config }
  if (r >= 400) throw new AxiosError(`HTTP ${r}`, 'ERR_BAD_REQUEST', config, null, response)
  return response
}

const cierre = jest.fn()
const adaptadorAntes = api.defaults.adapter

beforeEach(() => {
  guion = {}
  llamadas = []
  cierre.mockClear()
  olvidarConfirmacionDeSesion()
  api.defaults.adapter = responder as never
  registrarCierreDeSesion(cierre)
  fijarTokenEnMemoria('token-valido')
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  api.defaults.adapter = adaptadorAntes
  registrarCierreDeSesion(null)
  fijarTokenEnMemoria(null)
  jest.restoreAllMocks()
})

const pedir = () => api.post('/BIBLIOTECA-SERVICE/biblioteca/v1/libros/get/x')

describe('V-NUEVO-2 · un 401 suelto no cierra la sesión', () => {
  it('auth dice que la sesión vale: se repite la petición una vez, sale bien y NO se cierra', async () => {
    guion = { '/libros/get/x': [401, 200], '/auth/sesion': [200] }
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(llamadas).toEqual(['/libros/get/x', '/auth/sesion', '/libros/get/x'])
    expect(cierre).not.toHaveBeenCalled()
  })

  it('auth dice 401 (caducada o revocada): se cierra la sesión', async () => {
    guion = { '/libros/get/x': [401], '/auth/sesion': [401] }
    await expect(pedir()).rejects.toMatchObject({ response: { status: 401 } })
    expect(cierre).toHaveBeenCalledWith('EXPIRADA')
    expect(llamadas).toEqual(['/libros/get/x', '/auth/sesion'])
  })

  it('vale pero la repetición vuelve a dar 401: error a la pantalla, sin cerrar y sin bucle', async () => {
    guion = { '/libros/get/x': [401, 401], '/auth/sesion': [200] }
    await expect(pedir()).rejects.toMatchObject({ sesionVigente: true })
    expect(cierre).not.toHaveBeenCalled()
    expect(llamadas).toEqual(['/libros/get/x', '/auth/sesion', '/libros/get/x'])
  })

  it('sin red para confirmar (auth caído): no se cierra', async () => {
    guion = { '/libros/get/x': [401], '/auth/sesion': ['sin-red'] }
    await expect(pedir()).rejects.toMatchObject({ response: { status: 401 } })
    expect(cierre).not.toHaveBeenCalled()
  })

  it('cinco 401 a la vez comparten UNA sola pregunta a auth', async () => {
    guion = { '/libros/get/x': [401, 401, 401, 401, 401], '/auth/sesion': [200] }
    await Promise.all(Array.from({ length: 5 }, pedir))
    expect(llamadas.filter((l) => l === '/auth/sesion')).toHaveLength(1)
    expect(cierre).not.toHaveBeenCalled()
  })

  it('sin token en la petición no hay nada que confirmar: se cierra como siempre', async () => {
    fijarTokenEnMemoria(null)
    guion = { '/libros/get/x': [401] }
    await expect(pedir()).rejects.toBeTruthy()
    expect(cierre).toHaveBeenCalledWith('EXPIRADA')
    expect(llamadas).toEqual(['/libros/get/x'])
  })

  it('el 401 del login sigue siendo «datos malos», sin preguntar ni cerrar', async () => {
    guion = { '/auth/login': [401] }
    await expect(api.post('/AUTH-SERVICE/biblioteca/v1/auth/login', {})).rejects.toBeTruthy()
    expect(cierre).not.toHaveBeenCalled()
    expect(llamadas).toEqual(['/auth/login'])
  })
})
