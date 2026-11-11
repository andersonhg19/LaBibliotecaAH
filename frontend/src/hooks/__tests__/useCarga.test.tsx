import { act, renderHook, waitFor } from '@testing-library/react-native'

import { MENSAJE_ERROR_POR_DEFECTO, errorDeCarga, exigir, mensajeDeError, useCarga } from '@hooks/useCarga'

describe('exigir', () => {
  it('devuelve el object cuando la respuesta es correcta', () => {
    expect(exigir({ correct: true, object: { list: [1] } })).toEqual({ list: [1] })
  })

  it('lanza con el message del backend cuando correct es false', () => {
    expect(() => exigir({ correct: false, message: 'No tienes permiso sobre este movimiento' })).toThrow(
      'No tienes permiso sobre este movimiento',
    )
  })

  it('lanza con el mensaje generico cuando el backend no explica nada', () => {
    expect(() => exigir({ correct: false })).toThrow(MENSAJE_ERROR_POR_DEFECTO)
    expect(() => exigir(null)).toThrow(MENSAJE_ERROR_POR_DEFECTO)
  })
})

describe('mensajeDeError', () => {
  it('prefiere el mensaje del backend en errores de axios', () => {
    expect(mensajeDeError({ response: { data: { message: 'Token expirado' } } })).toBe('Token expirado')
  })

  it('usa el generico cuando solo hay un fallo de red', () => {
    expect(mensajeDeError(new Error('Network Error'))).toBe(MENSAJE_ERROR_POR_DEFECTO)
  })

  it('respeta el mensaje de un errorDeCarga', () => {
    expect(mensajeDeError(errorDeCarga('Periodo invalido'))).toBe('Periodo invalido')
  })
})

describe('useCarga', () => {
  it('distingue cargando, listo y error', async () => {
    let fallar = false
    const tarea = jest.fn(async () => {
      if (fallar) throw errorDeCarga('El nucleo familiar no existe')
    })

    const { result } = renderHook(() => useCarga(tarea))
    expect(result.current.cargando).toBe(true)

    await act(async () => {
      await result.current.cargar()
    })
    expect(result.current.cargando).toBe(false)
    expect(result.current.error).toBeNull()

    fallar = true
    await act(async () => {
      await result.current.cargar()
    })
    await waitFor(() => expect(result.current.error).toBe('El nucleo familiar no existe'))
    expect(result.current.cargando).toBe(false)
  })

  it('limpia el error al reintentar con exito', async () => {
    let fallar = true
    const tarea = jest.fn(async () => {
      if (fallar) throw errorDeCarga('Backend caido')
    })

    const { result } = renderHook(() => useCarga(tarea))
    await act(async () => {
      await result.current.cargar()
    })
    expect(result.current.error).toBe('Backend caido')

    fallar = false
    await act(async () => {
      await result.current.cargar()
    })
    expect(result.current.error).toBeNull()
  })

  it('refrescar no enciende el spinner de pantalla completa', async () => {
    const tarea = jest.fn(async () => {})
    const { result } = renderHook(() => useCarga(tarea))
    await act(async () => {
      await result.current.cargar()
    })

    await act(async () => {
      await result.current.refrescar()
    })
    expect(result.current.cargando).toBe(false)
    expect(result.current.refrescando).toBe(false)
    expect(tarea).toHaveBeenCalledTimes(2)
  })
})
