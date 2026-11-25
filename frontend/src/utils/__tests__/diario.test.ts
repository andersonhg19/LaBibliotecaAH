/*
 * EL DIARIO DEL REPRODUCTOR (0.5.0, contrato C9): cola en memoria + almacén, lotes de ≤ 50,
 * envío cada ~30 s, al ocultarse la página (keepalive) y al volver la red; nunca rompe nada.
 */
import { resultadoDe } from '@servicios/diarioService'
import {
  CADA_ENVIO_MS,
  CLAVE_DIARIO,
  COLA_MAX,
  Diario,
  EntornoDiario,
  EventoDiario,
  LOTE_MAX,
  MAX_POR_HORA,
  REPETIDO_MS,
  ResultadoEnvio,
  anotarDiario,
  limpiarTipo,
  uaCorto,
} from '@utils/diario'

function entorno(o: Partial<EntornoDiario> = {}) {
  let reloj = Date.UTC(2026, 10, 25, 21, 3, 11, 120)
  const guardado: Record<string, string> = {}
  const programados: { fn: () => void; ms: number; vivo: boolean }[] = []
  const lotes: EventoDiario[][] = []
  const alSalir: EventoDiario[][] = []
  let respuesta: ResultadoEnvio = 'ok'
  const e: EntornoDiario = {
    ahora: () => reloj,
    almacen: {
      getItem: (k) => guardado[k] ?? null,
      setItem: (k, v) => {
        guardado[k] = v
      },
    },
    enviar: async (l) => {
      lotes.push(l)
      return respuesta
    },
    enviarAlSalir: async (l) => {
      alSalir.push(l)
      return respuesta === 'ok'
    },
    contexto: () => ({ standalone: true, visible: true, red: true, ua: 'iPhone iOS 18.1 Safari 18.1', version: '0.5.0' }),
    programar: (fn, ms) => {
      const p = { fn, ms, vivo: true }
      programados.push(p)
      return () => {
        p.vivo = false
      }
    },
    ...o,
  }
  return {
    e,
    guardado,
    lotes,
    alSalir,
    programados,
    responder: (r: ResultadoEnvio) => (respuesta = r),
    avanzar: (ms: number) => (reloj += ms),
    /** Corre lo programado (guardado a 1 s y envío a 30 s). */
    correr: async () => {
      for (const p of programados.splice(0)) if (p.vivo) p.fn()
      for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
    },
  }
}

describe('C9 · el diario del reproductor', () => {
  it('anota con el formato del contrato y el contexto (standalone, cinta, visible, red, ua, versión)', () => {
    const x = entorno()
    const d = new Diario(x.e)
    d.anotar('atasco', { ejemplarId: 'e1', capitulo: 3, posicion: 812.44, detalle: 'texto corto', cinta: true })
    expect(d.pendientes()[0]).toEqual({
      cuando: '2026-11-25T21:03:11.120Z',
      tipo: 'atasco',
      ejemplarId: 'e1',
      capitulo: 3,
      posicion: 812.4,
      detalle: 'texto corto',
      contexto: {
        standalone: true,
        cinta: true,
        visible: true,
        red: true,
        ua: 'iPhone iOS 18.1 Safari 18.1',
        version: '0.5.0',
      },
    })
  })

  it('respeta los límites del contrato: tipo [a-z0-9-] ≤ 40, detalle ≤ 500, ua ≤ 200', () => {
    const x = entorno({
      contexto: () => ({ standalone: false, visible: true, red: true, ua: 'u'.repeat(300), version: '0.5.0' }),
    })
    const d = new Diario(x.e)
    d.anotar('Pausa Sistema!!' + 'x'.repeat(60), { detalle: 'd'.repeat(900), posicion: Number.NaN })
    const ev = d.pendientes()[0]
    expect(ev.tipo).toMatch(/^[a-z0-9-]{1,40}$/)
    expect(ev.tipo.startsWith('pausa-sistema-')).toBe(true)
    expect(ev.detalle).toHaveLength(500)
    expect(ev.contexto.ua).toHaveLength(200)
    expect(ev.posicion).toBeNull()
    expect(limpiarTipo('')).toBe('otro')
  })

  it('manda en lotes de ≤ 50 a los 30 s y vacía la cola si el servidor los guarda', async () => {
    const x = entorno()
    const d = new Diario(x.e)
    for (let i = 0; i < 120; i++) {
      x.avanzar(REPETIDO_MS)
      d.anotar('cambio-capitulo', { detalle: `n${i}` })
    }
    expect(x.programados.some((p) => p.ms === CADA_ENVIO_MS)).toBe(true)
    await x.correr()
    expect(x.lotes.map((l) => l.length)).toEqual([LOTE_MAX, LOTE_MAX, 20])
    expect(d.pendientes()).toHaveLength(0)
    expect(JSON.parse(x.guardado[CLAVE_DIARIO])).toEqual([])
  })

  it('sin red se queda en la cola (y en el almacén) y sale en la siguiente vuelta', async () => {
    const x = entorno()
    x.responder('reintentar')
    const d = new Diario(x.e)
    d.anotar('error-red')
    await x.correr()
    expect(d.pendientes()).toHaveLength(1)
    expect(JSON.parse(x.guardado[CLAVE_DIARIO])).toHaveLength(1)
    // Otra página (o la app recién abierta) recoge lo guardado.
    x.responder('ok')
    const otra = new Diario(x.e)
    expect(otra.pendientes()).toHaveLength(1)
    await otra.vaciar()
    expect(otra.pendientes()).toHaveLength(0)
  })

  it('un lote que el servidor rechaza (400) se tira; sin la ruta (0.4.0) se deja de mandar', async () => {
    const x = entorno()
    const d = new Diario(x.e)
    x.responder('descartar')
    d.anotar('atasco')
    await d.vaciar()
    expect(d.pendientes()).toHaveLength(0)
    x.responder('sin-ruta')
    x.avanzar(REPETIDO_MS)
    d.anotar('atasco')
    await d.vaciar()
    const n = x.lotes.length
    x.avanzar(REPETIDO_MS)
    d.anotar('reanuda')
    await d.vaciar()
    expect(x.lotes.length).toBe(n)
  })

  it('al ocultarse la página sale ya por keepalive; si falla, vuelve a la cola; sin red no se intenta', async () => {
    const x = entorno()
    const d = new Diario(x.e)
    d.anotar('oculta')
    d.alOcultarse(false)
    expect(x.alSalir).toHaveLength(0)
    x.responder('reintentar')
    d.alOcultarse(true)
    expect(x.alSalir).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(d.pendientes()).toHaveLength(1)
    x.responder('ok')
    d.alOcultarse(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(d.pendientes()).toHaveLength(0)
  })

  it('no repite el mismo evento en 2 s, ni pasa del tope por hora, ni de la cola máxima', () => {
    const x = entorno()
    const d = new Diario(x.e)
    d.anotar('espera-larga', { detalle: 'waiting 4 s' })
    d.anotar('espera-larga', { detalle: 'waiting 4 s' })
    expect(d.pendientes()).toHaveLength(1)
    for (let i = 0; i < MAX_POR_HORA + 50; i++) d.anotar('atasco', { detalle: String(i) })
    expect(d.pendientes()).toHaveLength(MAX_POR_HORA)
    x.avanzar(3_600_000)
    for (let i = 0; i < 200; i++) d.anotar('reanuda', { detalle: String(i) })
    expect(d.pendientes().length).toBeLessThanOrEqual(COLA_MAX)
  })

  it('nunca lanza: almacén roto, contexto roto o envío que revienta', async () => {
    const x = entorno({
      almacen: {
        getItem: () => {
          throw new Error('privado')
        },
        setItem: () => {
          throw new Error('lleno')
        },
      },
      enviar: async () => {
        throw new Error('boom')
      },
    })
    const d = new Diario(x.e)
    expect(() => d.anotar('inicio')).not.toThrow()
    await expect(d.vaciar()).resolves.toBeUndefined()
    const roto = new Diario({
      ...x.e,
      contexto: () => {
        throw new Error('sin navigator')
      },
    })
    expect(() => roto.anotar('inicio')).not.toThrow()
    // El diario de la página fuera del navegador (pruebas): ni lanza ni manda.
    expect(() => anotarDiario('inicio', { detalle: 'prueba' })).not.toThrow()
  })

  it('ua en corto', () => {
    expect(
      uaCorto(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone iOS 18.1 Safari 18.1')
    expect(
      uaCorto(
        'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Android 14 Chrome 131')
    expect(uaCorto('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36 Edg/131.0')).toBe(
      'Windows Edg 131',
    )
    expect(uaCorto('')).toBe('')
  })

  it('el servicio traduce la respuesta del servidor', () => {
    expect(resultadoDe(200)).toBe('ok')
    expect(resultadoDe(undefined)).toBe('reintentar')
    expect(resultadoDe(400)).toBe('descartar')
    expect(resultadoDe(404)).toBe('sin-ruta')
    expect(resultadoDe(405)).toBe('sin-ruta')
    expect(resultadoDe(401)).toBe('reintentar')
    expect(resultadoDe(503)).toBe('reintentar')
  })
})
