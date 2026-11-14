/*
 * REGRESIÓN DE LA AUDITORÍA 2-reproductor (2026-11-13, RP-01…RP-16), incorporada en 0.4.0.
 * Motor real + Cinta real, con MediaSource/SourceBuffer y mp4box falsos pero fieles
 * (segments mode, timestampOffset, appendWindow, rangos que se sobrescriben).
 * Cada `it` afirma el comportamiento CORRECTO (en 0.3.3 fallaban R-01…R-07 y R-13).
 */
/* eslint-disable @typescript-eslint/no-unsafe-function-type -- la fábrica de jest.mock no admite tipos de fuera */
import type { EstadoAudioDTO, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import { Cinta } from '@utils/cinta'
import { DependenciasMotor, MotorAudio } from '@utils/motorAudio'

const g = globalThis as unknown as Record<string, unknown>
g.__META = new WeakMap<ArrayBuffer, { dur: number; clave: string }>()
g.__SEG = new WeakMap<ArrayBuffer, { m0: number; m1: number; clave: string }>()

jest.mock('mp4box', () => {
  const G = globalThis as unknown as Record<string, WeakMap<ArrayBuffer, unknown>>
  return {
    MP4BoxBuffer: { fromArrayBuffer: (b: ArrayBuffer) => b },
    createFile: () => {
      const ts = 24000
      const spm = 1024
      const cebado = 1024
      // Un archivo entero (META) se lee de golpe en flush. Uno que llega por trozos (RP-07: el primero trae
      // un JSON {dur, clave}) se lee como mp4box: el moov enseguida y un segmento por cada trozo que llega.
      const f: Record<string, unknown> & {
        _m?: { dur: number; clave: string }
        _prog?: boolean
        _s: number
        _nb: number
      } = {
        _s: 0,
        _nb: 0,
        onError: null,
        onReady: null,
        onSegment: null,
        _listo() {
          const m = f._m as { dur: number; clave: string }
          const nb = Math.ceil((m.dur * ts + cebado + 600) / spm)
          f._nb = nb
          ;(f.onReady as Function)({
            tracks: [
              {
                id: 1,
                type: 'audio',
                timescale: ts,
                nb_samples: nb,
                samples_duration: nb * spm,
                edits: [{ media_time: cebado, segment_duration: Math.round(m.dur * 1000) }],
                movie_timescale: 1000,
                codec: 'mp4a.40.2',
              },
            ],
          })
        },
        _uno() {
          const m = f._m as { dur: number; clave: string }
          if (f._s >= f._nb) return
          const s = f._s
          const last = Math.min(f._nb, s + 256)
          f._s = last
          const b = new ArrayBuffer(4)
          G.__SEG.set(b, { m0: (s * spm) / ts, m1: (last * spm) / ts, clave: m.clave })
          ;(f.onSegment as Function)(1, null, b, last)
        },
        appendBuffer(b: ArrayBuffer) {
          const meta = G.__META.get(b) as { dur: number; clave: string } | undefined
          if (meta) {
            f._m = meta
            return
          }
          if (!f._m) {
            try {
              const t = new TextDecoder().decode(new Uint8Array(b))
              if (t.startsWith('{')) {
                f._m = JSON.parse(t)
                f._prog = true
                ;(f._listo as Function)()
              }
            } catch {
              /* ilegible: lo dirá flush */
            }
            return
          }
          if (f._prog) (f._uno as Function)()
        },
        setSegmentOptions() {},
        initializeSegmentation: () => ({ buffer: new ArrayBuffer(2) }),
        start() {},
        flush() {
          const m = f._m
          if (!m) return (f.onError as Function)('x', 'ilegible')
          if (!f._prog) (f._listo as Function)()
          while (f._s < f._nb) (f._uno as Function)()
        },
      }
      return f
    },
  }
})

type Rango = { a: number; b: number; clave: string }
class Oyentes {
  oy: Record<string, { f: () => void; once?: boolean }[]> = {}
  addEventListener(t: string, f: () => void, o?: { once?: boolean }) {
    ;(this.oy[t] ??= []).push({ f, once: o?.once })
  }
  removeEventListener() {}
  emitir(t: string) {
    const l = this.oy[t] ?? []
    this.oy[t] = l.filter((x) => !x.once)
    l.forEach((x) => x.f())
  }
}
class SBFalso extends Oyentes {
  updating = false
  mode = 'segments'
  timestampOffset = 0
  appendWindowStart = 0
  appendWindowEnd = Infinity
  rangos: Rango[] = []
  appends = 0
  private cortar(a: number, b: number) {
    const r: Rango[] = []
    for (const x of this.rangos) {
      if (x.b <= a || x.a >= b) r.push(x)
      else {
        if (x.a < a) r.push({ ...x, b: a })
        if (x.b > b) r.push({ ...x, a: b })
      }
    }
    this.rangos = r.sort((p, q) => p.a - q.a)
  }
  private hecho() {
    setTimeout(() => {
      this.updating = false
      this.emitir('updateend')
    }, 0)
  }
  appendBuffer(d: ArrayBuffer) {
    if (this.updating) throw Object.assign(new Error('updating'), { name: 'InvalidStateError' })
    this.updating = true
    this.appends++
    const m = (g.__SEG as WeakMap<ArrayBuffer, { m0: number; m1: number; clave: string }>).get(d)
    if (m) {
      const a = Math.max(m.m0 + this.timestampOffset, this.appendWindowStart)
      const b = Math.min(m.m1 + this.timestampOffset, this.appendWindowEnd)
      if (b > a) {
        this.cortar(a, b)
        this.rangos.push({ a, b, clave: m.clave })
        this.rangos.sort((p, q) => p.a - q.a)
      }
    }
    this.hecho()
  }
  remove(a: number, b: number) {
    this.updating = true
    this.cortar(a, b)
    this.hecho()
  }
  get buffered() {
    const u: { a: number; b: number }[] = []
    for (const r of this.rangos) {
      const l = u[u.length - 1]
      if (l && r.a <= l.b + 0.001) l.b = Math.max(l.b, r.b)
      else u.push({ a: r.a, b: r.b })
    }
    return { length: u.length, start: (i: number) => u[i].a, end: (i: number) => u[i].b }
  }
}
let ultimoSB: SBFalso | null = null
class MSFalso extends Oyentes {
  static isTypeSupported() {
    return true
  }
  readyState = 'closed'
  duration = NaN
  constructor() {
    super()
    setTimeout(() => {
      this.readyState = 'open'
      this.emitir('sourceopen')
    }, 0)
  }
  addSourceBuffer() {
    ultimoSB = new SBFalso()
    return ultimoSB
  }
}
g.MediaSource = MSFalso
let nBlob = 0
;(URL as unknown as Record<string, unknown>).createObjectURL = () => `blob:cinta-${++nBlob}`
;(URL as unknown as Record<string, unknown>).revokeObjectURL = () => {}

class AudioCinta extends Oyentes {
  src = ''
  _t = 0
  duration = NaN
  playbackRate = 1
  defaultPlaybackRate = 1
  volume = 1
  paused = true
  preload = ''
  get currentTime() {
    return this._t
  }
  set currentTime(v: number) {
    this._t = v
    this.emitir('seeking')
  }
  setAttribute() {}
  load() {}
  play() {
    this.paused = false
    this.emitir('play')
    return Promise.resolve()
  }
  pause() {
    if (this.paused) return
    this.paused = true
    this.emitir('pause')
  }
}

const finContinuo = (sb: SBFalso | null, t: number) => {
  if (!sb) return t
  const b = sb.buffered
  let fin = t
  for (let i = 0; i < b.length; i++) if (b.start(i) <= fin + 0.15 && b.end(i) > fin) fin = b.end(i)
  return fin
}
const claveEn = (t: number) => ultimoSB?.rangos.find((r) => t >= r.a && t < r.b)?.clave ?? null
const vaciar = async (n = 25) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

const DUR: Record<string, number[]> = { v: [100, 100, 100], w: [100, 100, 100] }
const listo = (voz: string, c: number): ResultDTO<EstadoAudioDTO> => ({
  correct: true,
  message: 'OK',
  errorCode: 0,
  object: {
    estado: 'LISTO',
    duracionSeg: DUR[voz][c],
    url1x: `/a/${voz}/cap-${c}.m4a`,
    url2x: `/a/${voz}/cap-${c}-2x.m4a`,
    urlTiempos: `/a/${voz}/cap-${c}.tiempos.json`,
  },
})
const tiempos = (c: number, dur: number): TiemposCapitulo => ({
  capitulo: c,
  vozId: 'v',
  duracion: dur,
  frases: Array.from({ length: Math.floor(dur / 10) }, (_, k) => ({
    id: `c${String(c).padStart(3, '0')}-s${String(k).padStart(5, '0')}`,
    t0: k * 10,
    t1: k * 10 + 9,
    palabras: [],
  })),
})
const LIBRO = {
  ejemplarId: 'e1',
  titulo: 'Cinta',
  autores: ['QA'],
  portadaUrl: null,
  capitulos: [
    { indice: 0, titulo: 'Uno', minutos: 2 },
    { indice: 1, titulo: 'Dos', minutos: 2 },
    { indice: 2, titulo: 'Tres', minutos: 2 },
  ],
}

function montar(
  o: {
    pedir?: DependenciasMotor['pedirEstado']
    falla?: (u: string) => boolean
    lenta?: (u: string) => Promise<void> | null
    cargarPartes?: DependenciasMotor['cargarPartes']
  } = {},
) {
  const el = new AudioCinta()
  const servidor: ProgresoDTO[] = []
  const descargas: string[] = []
  const durDe = (u: string) => {
    const m = /\/a\/(\w)\/cap-(\d+)(-2x)?/.exec(u)!
    return DUR[m[1]][Number(m[2])] / (m[3] ? 2 : 1)
  }
  const descargar = jest.fn(async (u: string) => {
    descargas.push(u)
    const espera = o.lenta?.(u)
    if (espera) await espera
    if (o.falla?.(u)) throw new Error('audio 404')
    const b = new ArrayBuffer(8)
    ;(g.__META as WeakMap<ArrayBuffer, unknown>).set(b, { dur: durDe(u), clave: u })
    return b
  })
  let cinta: Cinta | null = null
  const motor = new MotorAudio({
    crearAudio: () => el as unknown as HTMLAudioElement,
    pedirEstado: jest.fn(o.pedir ?? (async (d) => listo(d.vozId, d.capitulo))),
    cargarTiempos: async (u) => {
      const m = /\/a\/(\w)\/cap-(\d+)/.exec(u)!
      return tiempos(Number(m[2]), DUR[m[1]][Number(m[2])])
    },
    cargarPartes: o.cargarPartes,
    guardarServidor: async (p) => servidor.push(p),
    guardarLocal: async () => undefined,
    resolverUrl: (r) => r,
    dispositivo: () => 'iPhone',
    ahora: () => Date.now(),
    cinta: (e) => (cinta = new Cinta(e as unknown as HTMLAudioElement, descargar, true)),
  })
  /** Reproduce `seg` segundos reales en pasos de 0,25 s (un timeupdate cada paso), como el navegador. */
  const correr = async (seg: number) => {
    for (let n = 0; n < seg * 4; n++) {
      if (!el.paused) {
        if (el.src.startsWith('blob:')) {
          const fin = finContinuo(ultimoSB, el._t)
          const t = el._t + 0.25 * el.playbackRate
          if (t > fin) {
            el._t = fin
            el.emitir('timeupdate')
            el.emitir('waiting')
          } else {
            el._t = t
            el.emitir('timeupdate')
          }
        } else {
          el._t += 0.25 * el.playbackRate
          el.emitir('timeupdate')
        }
      }
      await vaciar(4)
    }
  }
  return { motor, el, servidor, descargas, correr, cinta: () => cinta }
}

beforeEach(() => {
  DUR.v = [100, 100, 100]
  DUR.w = [100, 100, 100]
  ultimoSB = null
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('Cinta: frontera entre capítulos (auditoría 2-reproductor)', () => {
  it('R-01a «Al final del capítulo» (puesto antes de la precarga) y luego ▶: sigue con el capítulo siguiente y la cuenta coincide con lo que suena', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar()
    expect(m.el.src).toMatch(/^blob:/)
    m.motor.setTemporizador('capitulo')
    await m.correr(102)
    const tras = m.motor.obtener()
    expect([tras.fase, tras.capitulo]).toEqual(['pausado', 0])
    m.motor.reproducir()
    await m.correr(30)
    const e = m.motor.obtener()
    const suena = claveEn(m.el.currentTime)
    expect([e.fase, e.capitulo]).toEqual(['reproduciendo', 1])
    expect(e.posicion).toBeLessThanOrEqual(e.duracion + 0.5)
    expect(suena ?? '').toContain(`cap-${e.capitulo}.`)
  })

  it('R-01b «Al final del capítulo» puesto con el siguiente YA en la cinta: no se oye el siguiente y al ▶ la cuenta coincide', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(70) // precarga a 45 s del final: el cap 1 ya está detrás en la cinta
    m.motor.setTemporizador('capitulo')
    await m.correr(35)
    const tras = m.motor.obtener()
    expect([tras.fase, tras.capitulo]).toEqual(['pausado', 0])
    expect(m.el.currentTime).toBeLessThanOrEqual(100.05) // al parar no se coló el siguiente
    m.motor.reproducir()
    await m.correr(30)
    const e = m.motor.obtener()
    const suena = claveEn(m.el.currentTime)
    expect([e.fase, e.capitulo]).toEqual(['reproduciendo', 1])
    expect(suena ?? '').toContain(`cap-${e.capitulo}.`)
    expect(e.posicion).toBeLessThanOrEqual(e.duracion + 0.5)
  })

  it('R-02 fin del libro y ▶: no se queda «reproduciendo» en silencio', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 2, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(102)
    expect(m.motor.obtener().fase).toBe('pausado')
    m.motor.reproducir()
    await vaciar()
    const t1 = m.el.currentTime
    await m.correr(5)
    const e = m.motor.obtener()
    // Ni «Pausar» mudo: suena de verdad (el último capítulo desde el principio).
    expect(e.fase).toBe('reproduciendo')
    expect(e.capitulo).toBe(2)
    expect(m.el.currentTime).toBeGreaterThan(t1 + 1)
  })

  it('R-03 precarga cuyo audio da 404: no se vuelve a bajar en cada timeupdate', async () => {
    const m = montar({ falla: (u) => u.includes('cap-1') })
    m.motor.abrir(LIBRO, { capitulo: 0, posicion: 50, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(49)
    const n = m.descargas.filter((u) => u.includes('cap-1')).length
    expect(n).toBeLessThanOrEqual(5)
  })

  it('R-04 un fallo de descarga pasajero no apaga la cinta para toda la sesión', async () => {
    let fallos = 1
    const m = montar({ falla: (u) => u.includes('cap-0') && fallos-- > 0 })
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar()
    m.motor.irACapitulo(1)
    await vaciar()
    expect(m.el.src).toMatch(/^blob:/)
  })

  it('R-05 olvidarSiguientes() también quita del SourceBuffer lo ya añadido del tramo olvidado', async () => {
    DUR.v = [30, 100, 100]
    const el = new AudioCinta()
    const descargar = async (u: string) => {
      const b = new ArrayBuffer(8)
      ;(g.__META as WeakMap<ArrayBuffer, unknown>).set(b, { dur: u.includes('cap-0') ? 30 : 100, clave: u })
      return b
    }
    const c = new Cinta(el as unknown as HTMLAudioElement, descargar, true)
    await c.cargar('/a/v/cap-0.m4a', 0)
    await c.encolar('/a/v/cap-1.m4a')
    await vaciar()
    c.olvidarSiguientes()
    await c.encolar('/a/w/cap-1.m4a')
    await vaciar()
    expect(claveEn(40)).toBe('/a/w/cap-1.m4a')
  })

  it('R-06 precarga de la voz ANTERIOR que llega tras cambiar de voz en pausa: no suena la voz vieja en el capítulo siguiente', async () => {
    DUR.v = [30, 100, 100]
    DUR.w = [30, 100, 100]
    let soltar: (() => void) | null = null
    const pedir: DependenciasMotor['pedirEstado'] = async (d) => {
      if (d.vozId === 'v' && d.capitulo === 1) await new Promise<void>((r) => (soltar = r))
      return listo(d.vozId, d.capitulo)
    }
    const m = montar({ pedir })
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(1) // 30 s de capítulo: se pide ya el siguiente (queda en vuelo)
    m.motor.pausar()
    m.motor.setVoz('w', 'W')
    await vaciar()
    ;(soltar as unknown as () => void)?.()
    await vaciar()
    m.motor.reproducir()
    await m.correr(32)
    const e = m.motor.obtener()
    const suena = claveEn(m.el.currentTime)
    expect(e.capitulo).toBe(1)
    expect(suena ?? '').toContain('/w/')
  })

  it('R-07 cambiar a un capítulo que se genera (partes) mientras la cinta aún baja otro: la cinta no vuelve a secuestrar el <audio>', async () => {
    let soltar: (() => void) | null = null
    const pedir: DependenciasMotor['pedirEstado'] = async (d) =>
      d.capitulo === 1
        ? {
            correct: true,
            message: 'OK',
            errorCode: 0,
            object: {
              estado: 'GENERANDO',
              duracionSeg: null,
              url1x: null,
              url2x: null,
              urlTiempos: null,
              urlPartes: '/a/v/cap-001.partes.json',
            },
          }
        : listo(d.vozId, d.capitulo)
    const m = montar({
      pedir,
      lenta: (u) => (u.includes('cap-0') ? new Promise<void>((r) => (soltar = r)) : null),
      cargarPartes: async () => ({
        versionFormato: 1,
        capitulo: 1,
        vozId: 'v',
        completo: false,
        duracionEstimada: 60,
        partes: [{ n: 0, archivo: 'cap-001.p000.m4a', t0: 0, t1: 20 }],
        frases: [],
      }),
    })
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar()
    m.motor.irACapitulo(1)
    await vaciar()
    const antes = m.el.src
    ;(soltar as unknown as () => void)?.()
    await vaciar()
    expect(antes).toContain('p000')
    expect(m.el.src).toContain('p000')
  })

  it('R-08 dos capítulos vacíos seguidos se saltan y se entra en el siguiente con voz', async () => {
    const libro = {
      ...LIBRO,
      capitulos: [
        { indice: 0, titulo: 'Uno', minutos: 2 },
        { indice: 1, titulo: 'Vacío', minutos: 0 },
        { indice: 2, titulo: 'Vacío', minutos: 0 },
        { indice: 3, titulo: 'Cuatro', minutos: 2 },
      ],
    }
    DUR.v = [100, 0, 0, 100]
    const m = montar()
    m.motor.abrir(libro, { capitulo: 0, posicion: 80, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(25)
    const e = m.motor.obtener()
    expect(e.capitulo).toBe(3)
    expect(claveEn(m.el.currentTime)).toContain('cap-3.')
  })

  it('R-09 cruce a 1x: búfer continuo en la frontera y progreso guardado sin pasarse de la duración', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, posicion: 60, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(45)
    const b = ultimoSB!.buffered
    const huecos: string[] = []
    for (let i = 1; i < b.length; i++) huecos.push(`${b.end(i - 1).toFixed(3)}→${b.start(i).toFixed(3)}`)
    const e = m.motor.obtener()
    const malos = m.servidor.filter((p) => (p.posicionAudioSeg ?? 0) > 100.5)
    expect(e.capitulo).toBe(1)
    expect(huecos).toEqual([])
    expect(malos).toEqual([])
  })

  it('R-10 cruce a 5x (archivo 2x a 2.5): la cuenta pasa al capítulo siguiente y el progreso no se pasa', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, posicion: 70, vozId: 'v', velocidad: 5 })
    await vaciar()
    await m.correr(10)
    const e = m.motor.obtener()
    const malos = m.servidor.filter((p) => p.capitulo === 0 && (p.posicionAudioSeg ?? 0) > 100.5)
    expect(e.capitulo).toBe(1)
    expect(malos).toEqual([])
  })

  it('R-11 cambiar de 2x a 3x (cruza 2.5) a 1 s del final: sin repetir el principio del siguiente', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, posicion: 80, vozId: 'v', velocidad: 2 })
    await vaciar()
    await m.correr(9.5) // 19 s a 2x → pos ~99
    m.motor.setVelocidad(3)
    await vaciar()
    await m.correr(6)
    const e = m.motor.obtener()
    expect(e.capitulo).toBe(1)
    expect(claveEn(m.el.currentTime) ?? '').toContain('cap-1-2x')
  })

  it('R-12 capítulo largo (20 min): lo añadido nunca pasa de ~150 s y no hay errores', async () => {
    DUR.v = [1200, 100, 100]
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 2.5 })
    await vaciar()
    let max = 0
    for (let k = 0; k < 16; k++) {
      await m.correr(10)
      const tot = ultimoSB!.rangos.reduce((a, r) => a + r.b - r.a, 0)
      max = Math.max(max, tot)
    }
    expect(max).toBeLessThan(170)
  }, 300000)
})

describe('Cinta: arranque (auditoría 2-reproductor)', () => {
  it('R-13 el «ended» del silencio de desbloqueo llega mientras la cinta baja el capítulo: no se salta el capítulo pedido', async () => {
    let soltar: (() => void) | null = null
    const m = montar({ lenta: (u) => (u.includes('cap-0') ? new Promise<void>((r) => (soltar = r)) : null) })
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar(3)
    m.el.emitir('ended') // el silencio WAV de 0,1 s termina (no llegó a pausarse a tiempo)
    ;(soltar as unknown as () => void)?.()
    await vaciar()
    const e = m.motor.obtener()
    expect(e.capitulo).toBe(0)
    expect(m.descargas.some((u) => u.includes('cap-1.'))).toBe(false)
  })
})

describe('Cinta 0.4.0: descarga progresiva, ventanas y cancelación', () => {
  /** Un flujo de descarga que suelta los trozos cuando la prueba quiere. */
  function flujo(trozos: ArrayBuffer[]) {
    const esperas: ((r: { done: boolean; value?: Uint8Array }) => void)[] = []
    let i = 0
    const lector = {
      read: () =>
        new Promise<{ done: boolean; value?: Uint8Array }>((r) => {
          esperas.push(r)
        }),
    }
    const soltar = (n: number) => {
      for (let k = 0; k < n; k++) {
        const r = esperas.shift()
        if (!r) return
        r(i < trozos.length ? { done: false, value: new Uint8Array(trozos[i++]) } : { done: true })
      }
    }
    const total = trozos.reduce((a, t) => a + t.byteLength, 0)
    return { flujo: { getReader: () => lector }, total, soltar }
  }

  it('RP-07 suena en cuanto llega el primer trozo (sin bajar el capítulo entero) y sigue añadiendo según llega', async () => {
    const url = '/a/v/cap-0.m4a'
    const cabeza = new TextEncoder().encode(JSON.stringify({ dur: 100, clave: url })).buffer as ArrayBuffer
    const f = flujo([cabeza, ...Array.from({ length: 10 }, () => new ArrayBuffer(1))])
    const el = new AudioCinta()
    const progreso: number[] = []
    const c = new Cinta(el as unknown as HTMLAudioElement, async () => ({ flujo: f.flujo, total: f.total }), true)
    c.alProgresar = (_u, x) => progreso.push(x)
    let cargado = false
    c.cargar(url, 0).then(() => (cargado = true))
    for (let k = 0; k < 3; k++) {
      f.soltar(1)
      await vaciar()
    }
    // La cabeza y dos trozos: ya suena, aunque falten ocho.
    expect(cargado).toBe(true)
    expect(c.actual?.archivo.completo).toBe(false)
    expect(claveEn(1)).toBe(url)
    expect(finContinuo(ultimoSB, 0)).toBeLessThan(25)
    for (let k = 0; k < 10; k++) {
      f.soltar(1)
      await vaciar()
    }
    expect(c.actual?.archivo.completo).toBe(true)
    expect(finContinuo(ultimoSB, 0)).toBeGreaterThanOrEqual(90)
    expect(progreso[progreso.length - 1]).toBe(1)
    expect(progreso.some((x) => x > 0 && x < 1)).toBe(true)
  })

  it('RP-11 al volver a añadir el final de un tramo, no se pisa el principio del siguiente ya añadido', async () => {
    DUR.v = [30, 100, 100]
    const el = new AudioCinta()
    const descargar = async (u: string) => {
      const b = new ArrayBuffer(8)
      ;(g.__META as WeakMap<ArrayBuffer, unknown>).set(b, { dur: u.includes('cap-0') ? 30 : 100, clave: u })
      return b
    }
    const c = new Cinta(el as unknown as HTMLAudioElement, descargar, true)
    await c.cargar('/a/v/cap-0.m4a', 0)
    await c.encolar('/a/v/cap-1.m4a')
    await vaciar()
    expect(claveEn(30.05)).toBe('/a/v/cap-1.m4a')
    // Lo ya oído del capítulo 0 se soltó; un salto atrás lo vuelve a añadir.
    ultimoSB!.remove(0, 29.9)
    await vaciar()
    c.irA(5)
    await vaciar()
    expect(claveEn(29.95)).toBe('/a/v/cap-0.m4a')
    expect(claveEn(30.05)).toBe('/a/v/cap-1.m4a')
  })

  it('D7 una descarga que llega tras detener la voz no vuelve a enganchar el <audio>', async () => {
    let soltar: (() => void) | null = null
    const m = montar({ lenta: (u) => (u.includes('cap-0') ? new Promise<void>((r) => (soltar = r)) : null) })
    m.motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await vaciar(3)
    m.motor.detener()
    ;(soltar as unknown as () => void)?.()
    await vaciar()
    expect(m.el.src).not.toMatch(/^blob:/)
    expect(m.motor.obtener().fase).toBe('inactivo')
  })

  it('D8 cambiar de voz con el siguiente ya en la cinta lo quita y pone el de la voz nueva', async () => {
    const m = montar()
    m.motor.abrir(LIBRO, { capitulo: 0, posicion: 50, vozId: 'v', velocidad: 1 })
    await vaciar()
    await m.correr(10)
    expect(m.cinta()?.siguienteDe(m.cinta()?.actual ?? null)?.clave).toBe('/a/v/cap-1.m4a')
    m.motor.setVoz('w', 'W') // sonando: espera a que la nueva esté LISTA y cambia en la misma frase
    await vaciar()
    await m.correr(45)
    const e = m.motor.obtener()
    expect([e.vozId, e.capitulo]).toEqual(['w', 1])
    expect(claveEn(m.el.currentTime) ?? '').toContain('/w/cap-1')
  })
})
