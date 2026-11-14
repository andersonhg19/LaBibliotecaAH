import { CLAVE_VOZ, unaSolaVoz } from '@utils/unaSolaVoz'

/*
 * V-NUEVO-3 (validación web 0.4.0): dos pestañas de la misma cuenta sonaban a
 * la vez. La que empieza a sonar avisa y las demás se pausan.
 */

/** Un BroadcastChannel falso: los canales del mismo nombre se oyen entre sí (no a sí mismos). */
function bus() {
  const abiertos: Canal[] = []
  class Canal {
    onmessage: ((e: { data: unknown }) => void) | null = null
    constructor(public nombre: string) {
      abiertos.push(this)
    }
    postMessage(data: unknown) {
      abiertos.filter((c) => c !== this && c.nombre === this.nombre).forEach((c) => c.onmessage?.({ data }))
    }
    close() {
      abiertos.splice(abiertos.indexOf(this), 1)
    }
  }
  return Canal
}

/** localStorage compartido con el evento `storage`, que solo llega a las OTRAS pestañas. */
function navegadorSinCanal() {
  const pestanas: { oyentes: ((e: StorageEvent) => void)[] }[] = []
  const nueva = () => {
    const p = { oyentes: [] as ((e: StorageEvent) => void)[] }
    pestanas.push(p)
    return {
      localStorage: {
        setItem: (key: string, newValue: string) =>
          pestanas
            .filter((o) => o !== p)
            .forEach((o) => o.oyentes.forEach((f) => f({ key, newValue } as StorageEvent))),
      },
      addEventListener: (_t: string, f: (e: StorageEvent) => void) => p.oyentes.push(f),
      removeEventListener: (_t: string, f: (e: StorageEvent) => void) => p.oyentes.splice(p.oyentes.indexOf(f), 1),
    }
  }
  return nueva
}

describe('V-NUEVO-3 · una sola voz por navegador', () => {
  it('con BroadcastChannel: la pestaña que empieza a sonar calla a las demás, no a sí misma', () => {
    const BroadcastChannel = bus()
    const calla1 = jest.fn()
    const calla2 = jest.fn()
    const calla3 = jest.fn()
    const t1 = unaSolaVoz(calla1, { BroadcastChannel })
    const t2 = unaSolaVoz(calla2, { BroadcastChannel })
    unaSolaVoz(calla3, { BroadcastChannel })
    t2.avisar()
    expect(calla1).toHaveBeenCalledTimes(1)
    expect(calla3).toHaveBeenCalledTimes(1)
    expect(calla2).not.toHaveBeenCalled()
    t1.avisar()
    expect(calla2).toHaveBeenCalledTimes(1)
    t1.cerrar()
    t2.avisar()
    expect(calla1).toHaveBeenCalledTimes(1) // cerrada: ya no escucha
  })

  it('sin BroadcastChannel: por el evento storage de localStorage', () => {
    const pestana = navegadorSinCanal()
    const calla1 = jest.fn()
    const calla2 = jest.fn()
    const t1 = unaSolaVoz(calla1, pestana())
    const t2 = unaSolaVoz(calla2, pestana())
    t1.avisar()
    expect(calla2).toHaveBeenCalledTimes(1)
    expect(calla1).not.toHaveBeenCalled()
    t2.avisar()
    expect(calla1).toHaveBeenCalledTimes(1)
  })

  it('ignora mensajes ajenos o rotos', () => {
    const pestana = navegadorSinCanal()
    const calla = jest.fn()
    unaSolaVoz(calla, pestana())
    const otra = pestana()
    otra.localStorage.setItem(CLAVE_VOZ, 'no es json')
    otra.localStorage.setItem('otra.clave', JSON.stringify({ tipo: 'sonando', id: 'x' }))
    otra.localStorage.setItem(CLAVE_VOZ, JSON.stringify({ tipo: 'otra-cosa', id: 'x' }))
    expect(calla).not.toHaveBeenCalled()
  })
})
