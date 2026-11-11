import { act, renderHook } from '@testing-library/react-native'

import { useAccionUnica } from '@hooks/useAccionUnica'

describe('useAccionUnica', () => {
  it('ignora el segundo disparo mientras el primero sigue en curso', async () => {
    let resolver: () => void = () => {}
    const accion = jest.fn(
      () =>
        new Promise<void>((res) => {
          resolver = res
        }),
    )

    const { result } = renderHook(() => useAccionUnica(accion))

    await act(async () => {
      // El doble toque: dos llamadas antes de que React repinte el boton.
      result.current.ejecutar()
      result.current.ejecutar()
      resolver()
    })

    expect(accion).toHaveBeenCalledTimes(1)
  })

  it('vuelve a permitir la accion cuando la anterior termino', async () => {
    const accion = jest.fn(async () => {})
    const { result } = renderHook(() => useAccionUnica(accion))

    await act(async () => {
      await result.current.ejecutar()
    })
    await act(async () => {
      await result.current.ejecutar()
    })

    expect(accion).toHaveBeenCalledTimes(2)
    expect(result.current.ejecutando).toBe(false)
  })

  it('libera el cerrojo aunque la accion falle', async () => {
    const accion = jest.fn(async () => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useAccionUnica(accion))

    await act(async () => {
      await result.current.ejecutar().catch(() => null)
    })
    expect(result.current.ejecutando).toBe(false)

    await act(async () => {
      await result.current.ejecutar().catch(() => null)
    })
    expect(accion).toHaveBeenCalledTimes(2)
  })
})
