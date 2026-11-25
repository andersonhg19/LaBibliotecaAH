/*
 * EL REPRODUCTOR BLINDADO (0.5.0, contrato C13) Y SU DIARIO (C9): vigilante de atascos,
 * pausa del sistema frente a la del usuario, cambio de capítulo por todas las vías,
 * Media Session al día con artwork del propio origen, y lo que se anota en el diario.
 * Con un <audio> de mentira y un reloj propio (el vigilante se llama a mano: `vigilar()`).
 */
import type { CapituloResumen, EstadoAudioDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import type { DatosDiario } from '@utils/diario'
import {
  ATASCO_MS,
  DependenciasMotor,
  LatidoVoz,
  MAX_RECUPERACIONES,
  MotorAudio,
  TEXTOS_VOZ,
} from '@utils/motorAudio'

class AudioFalso {
  src = ''
  currentTime = 0
  duration = 100
  playbackRate = 1
  defaultPlaybackRate = 1
  volume = 1
  paused = true
  ended = false
  readyState = 4
  networkState = 1
  preload = ''
  cargas = 0
  error: { code: number; message: string } | null = null
  oyentes: Record<string, (() => void)[]> = {}
  addEventListener(t: string, f: () => void) {
    ;(this.oyentes[t] ??= []).push(f)
  }
  setAttribute() {}
  load() {
    this.cargas++
    this.emitir('loadedmetadata')
  }
  emitir(t: string) {
    ;(this.oyentes[t] ?? []).forEach((f) => f())
  }
  play() {
    if (!this.paused) return Promise.resolve()
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

const listo = (cap: number): ResultDTO<EstadoAudioDTO> => ({
  correct: true,
  message: 'OK',
  errorCode: 0,
  object: {
    estado: 'LISTO',
    duracionSeg: 100,
    url1x: `/a/cap-${cap}.m4a`,
    url2x: `/a/cap-${cap}-2x.m4a`,
    urlTiempos: `/a/cap-${cap}.tiempos.json`,
  },
})

const TIEMPOS: TiemposCapitulo = { capitulo: 0, vozId: 'v', duracion: 100, frases: [] }

const caps = (n = 3): CapituloResumen[] =>
  Array.from({ length: n }, (_, i) => ({ indice: i, titulo: `Cap ${i}`, minutos: 2 }))

const libro = (portadaUrl: string | null = null) => ({
  ejemplarId: 'e1',
  titulo: 'El guardián',
  autores: ['Biblioteca AH'],
  portadaUrl,
  capitulos: caps(),
})

const esperar = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

type Anotado = { tipo: string } & DatosDiario

function montar(o: Partial<DependenciasMotor> & { red?: { hay: boolean } } = {}) {
  const el = new AudioFalso()
  let reloj = 1_000_000
  const diario: Anotado[] = []
  const latidos: { d: LatidoVoz; alSalir: boolean }[] = []
  let visibilidad: ((v: boolean) => void) | null = null
  const red = o.red ?? { hay: true }
  const deps: DependenciasMotor = {
    crearAudio: () => el as unknown as HTMLAudioElement,
    pedirEstado: jest.fn(async (d) => listo(d.capitulo)),
    cargarTiempos: async () => TIEMPOS,
    guardarServidor: async () => ({ correct: true }),
    guardarLocal: async () => undefined,
    resolverUrl: (r) => r,
    dispositivo: () => 'iPhone',
    ahora: () => reloj,
    latido: async (d, op) => latidos.push({ d, alSalir: !!op?.alSalir }),
    nuevoId: () => 'sesion-1',
    vigilarCadaMs: 0,
    diario: (tipo, d) => diario.push({ tipo: String(tipo), ...d }),
    alCambiarVisibilidad: (fn) => {
      visibilidad = fn
      return () => {}
    },
    enLinea: () => red.hay,
    origenWeb: () => 'https://web.casa:7050',
    conServiceWorker: () => true,
    ...o,
  }
  const motor = new MotorAudio(deps)
  return {
    motor,
    el,
    deps,
    diario,
    latidos,
    red,
    tipos: () => diario.map((x) => x.tipo),
    avanzarReloj: (ms: number) => (reloj += ms),
    verse: (v: boolean) => visibilidad?.(v),
  }
}

/** Abre el libro y lo deja sonando en `pos`, con el reloj ya lejos del último cambio de fuente. */
async function sonando(m: ReturnType<typeof montar>, pos = 30, capitulo = 0) {
  m.motor.abrir(libro(), { capitulo, posicion: pos, vozId: 'v', velocidad: 1 })
  await esperar()
  m.el.currentTime = pos
  m.el.emitir('timeupdate')
  m.avanzarReloj(2_000)
  expect(m.motor.obtener().fase).toBe('reproduciendo')
}

/** Una Media Session de mentira: guarda las acciones, los metadatos y las posiciones. */
function conMediaSession() {
  const nav = globalThis.navigator as unknown as Record<string, unknown>
  const antes = nav.mediaSession
  const MMantes = (globalThis as Record<string, unknown>).MediaMetadata
  const acciones: Record<string, ((d?: { seekTime?: number; seekOffset?: number }) => void) | null> = {}
  const metadatos: { title: string; artwork: { src: string }[] }[] = []
  const posiciones: (MediaPositionState | undefined)[] = []
  nav.mediaSession = {
    set metadata(x: { title: string; artwork: { src: string }[] } | null) {
      if (x) metadatos.push(x)
    },
    setActionHandler(a: string, f: (d?: { seekTime?: number }) => void) {
      acciones[a] = f
    },
    setPositionState(p?: MediaPositionState) {
      posiciones.push(p)
    },
    playbackState: 'none',
  }
  ;(globalThis as Record<string, unknown>).MediaMetadata = class {
    title: string
    artwork: { src: string }[]
    constructor(o: { title: string; artwork: { src: string }[] }) {
      this.title = o.title
      this.artwork = o.artwork
    }
  }
  return {
    acciones,
    metadatos,
    posiciones,
    restaurar: () => {
      if (antes === undefined) delete nav.mediaSession
      else nav.mediaSession = antes
      ;(globalThis as Record<string, unknown>).MediaMetadata = MMantes
    },
  }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('C13 · vigilante de atascos', () => {
  it('8 s sin avanzar queriendo sonar: anota «atasco» y recarga en la MISMA posición; al avanzar, «recuperado»', async () => {
    const m = montar()
    await sonando(m, 30)
    m.motor.vigilar() // línea de base
    m.avanzarReloj(ATASCO_MS - 1)
    m.motor.vigilar()
    expect(m.tipos()).not.toContain('atasco')
    const cargasAntes = m.el.cargas
    m.avanzarReloj(1)
    m.motor.vigilar()
    expect(m.tipos()).toContain('atasco')
    expect(m.diario.find((x) => x.tipo === 'atasco')?.detalle).toMatch(/^1\/3 8 s sin avanzar rs=4/)
    expect(m.el.cargas).toBe(cargasAntes + 1)
    expect(m.el.currentTime).toBe(30)
    expect(m.motor.obtener().fase).toBe('reproduciendo')
    m.el.currentTime = 33
    m.motor.vigilar()
    expect(m.tipos()).toContain('atasco-recuperado')
  })

  it(`tras ${MAX_RECUPERACIONES} recuperaciones sin éxito: error visible con «Reintentar», y ▶ vuelve a pedirlo`, async () => {
    const m = montar()
    await sonando(m, 30)
    m.motor.vigilar()
    for (let i = 0; i < MAX_RECUPERACIONES; i++) {
      m.avanzarReloj(ATASCO_MS)
      m.motor.vigilar()
      expect(m.motor.obtener().fase).toBe('reproduciendo')
    }
    m.avanzarReloj(ATASCO_MS)
    m.motor.vigilar()
    const e = m.motor.obtener()
    expect([e.fase, e.tipoError, e.mensaje]).toEqual(['error', 'audio', TEXTOS_VOZ.atascada])
    expect(m.tipos().filter((t) => t === 'atasco')).toHaveLength(MAX_RECUPERACIONES + 1)
    expect(m.el.paused).toBe(true)
    const pedir = m.deps.pedirEstado as jest.Mock
    const antes = pedir.mock.calls.length
    m.motor.reproducir()
    await esperar()
    expect(pedir.mock.calls.length).toBe(antes + 1)
    expect(m.motor.obtener().fase).toBe('reproduciendo')
    expect(m.el.currentTime).toBe(30)
  })

  it('en pausa del usuario no hay atasco por mucho que pase el tiempo', async () => {
    const m = montar()
    await sonando(m)
    m.motor.pausar()
    m.motor.vigilar()
    m.avanzarReloj(60_000)
    m.motor.vigilar()
    expect(m.tipos()).not.toContain('atasco')
  })

  it('quieto justo al final del capítulo sin «ended» (iOS suspendido): pasa al siguiente y suena', async () => {
    const m = montar()
    await sonando(m, 99.8)
    m.motor.vigilar()
    m.avanzarReloj(ATASCO_MS)
    m.motor.vigilar()
    await esperar()
    expect(m.motor.obtener().capitulo).toBe(1)
    expect(m.el.src).toBe('/a/cap-1.m4a')
    expect(m.motor.obtener().fase).toBe('reproduciendo')
  })

  it('con la cinta, el atasco la rehace en la misma posición', async () => {
    const cargas: [string, number][] = []
    let soltadas = 0
    const el0 = new AudioFalso()
    const cinta = {
      actual: null as null | { clave: string; inicio: number; fin: number },
      get puesta() {
        return el0.src === 'blob:cinta'
      },
      siguienteDe: () => null,
      tiempo() {
        return this.actual ? el0.currentTime - this.actual.inicio : 0
      },
      async cargar(url: string, t: number) {
        cargas.push([url, t])
        el0.src = 'blob:cinta'
        this.actual = { clave: url, inicio: 0, fin: 100 }
        el0.currentTime = t
        return this.actual
      },
      encolar: async () => null,
      olvidarSiguientes() {},
      avanzar: () => null,
      irA(t: number) {
        el0.currentTime = t
      },
      bomba() {},
      soltar() {
        soltadas++
        this.actual = null
        el0.src = ''
      },
    }
    const m = montar({ crearAudio: () => el0 as unknown as HTMLAudioElement, cinta: () => cinta as never })
    m.motor.abrir(libro(), { capitulo: 0, posicion: 40, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(m.motor.obtener().fase).toBe('reproduciendo')
    m.avanzarReloj(2_000)
    m.motor.vigilar()
    m.avanzarReloj(ATASCO_MS)
    m.motor.vigilar()
    await esperar()
    expect(soltadas).toBe(1)
    expect(cargas).toEqual([
      ['/a/cap-0.m4a', 40],
      ['/a/cap-0.m4a', 40],
    ])
    expect(m.diario.find((x) => x.tipo === 'atasco')?.cinta).toBe(true)
  })

  it('una espera larga del <audio> (waiting > 3 s) va al diario; una corta, no', async () => {
    const m = montar()
    await sonando(m)
    m.el.emitir('waiting')
    m.avanzarReloj(1_000)
    m.el.emitir('playing')
    expect(m.tipos()).not.toContain('espera-larga')
    m.el.emitir('stalled')
    m.el.emitir('suspend')
    m.avanzarReloj(4_200)
    m.el.emitir('playing')
    expect(m.diario.find((x) => x.tipo === 'espera-larga')?.detalle).toBe('stalled+suspend 4.2 s')
  })
})

describe('C13 · pausa del sistema frente a pausa del usuario', () => {
  it('una pausa que no pidió el usuario (llamada, Siri) es «pausa-sistema» y al volver la página se reanuda sola', async () => {
    const m = montar()
    await sonando(m)
    m.el.pause() // la hace iOS, no el motor
    expect(m.tipos()).toContain('pausa-sistema')
    expect(m.motor.obtener().fase).toBe('pausado')
    m.verse(false)
    expect(m.el.paused).toBe(true)
    m.verse(true)
    expect(m.el.paused).toBe(false)
    expect(m.motor.obtener().fase).toBe('reproduciendo')
    expect(m.tipos()).toEqual(expect.arrayContaining(['oculta', 'visible', 'reanuda']))
  })

  it('una pausa del sistema de hace más de 15 min no se reanuda sola (auriculares fuera, teléfono en la mesa)', async () => {
    const m = montar()
    await sonando(m)
    m.el.pause()
    m.avanzarReloj(16 * 60_000)
    m.verse(true)
    expect(m.el.paused).toBe(true)
    // ▶ sigue funcionando como siempre.
    m.motor.reproducir()
    expect(m.el.paused).toBe(false)
  })

  it('la pausa del usuario NO se reanuda al volver', async () => {
    const m = montar()
    await sonando(m)
    m.motor.pausar()
    expect(m.tipos()).toContain('pausa-usuario')
    expect(m.tipos()).not.toContain('pausa-sistema')
    m.verse(true)
    expect(m.el.paused).toBe(true)
    expect(m.motor.obtener().fase).toBe('pausado')
  })

  it('la pausa del final del archivo (antes de «ended») y la de recargar la fuente no son del sistema', async () => {
    const m = montar()
    await sonando(m)
    m.el.ended = true
    m.el.pause()
    expect(m.tipos()).not.toContain('pausa-sistema')
    const m2 = montar()
    m2.motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    m2.el.pause() // en el mismo instante del cambio de src
    expect(m2.tipos()).not.toContain('pausa-sistema')
  })

  it('tras una pausa del sistema, el ▶ de la pantalla de bloqueo suena', async () => {
    const ms = conMediaSession()
    try {
      const m = montar()
      await sonando(m)
      m.el.pause()
      ms.acciones.play?.()
      expect(m.el.paused).toBe(false)
      expect(m.motor.obtener().fase).toBe('reproduciendo')
    } finally {
      ms.restaurar()
    }
  })
})

describe('C13 · cambio de capítulo por todas las vías deja sonando el capítulo correcto', () => {
  const sonandoCap = (m: ReturnType<typeof montar>, cap: number) => {
    const e = m.motor.obtener()
    expect([e.capitulo, e.fase, m.el.src, m.el.paused]).toEqual([cap, 'reproduciendo', `/a/cap-${cap}.m4a`, false])
  }

  it('botón «siguiente»', async () => {
    const m = montar()
    await sonando(m)
    m.motor.capituloSiguiente()
    await esperar()
    sonandoCap(m, 1)
    expect(m.diario.filter((x) => x.tipo === 'cambio-capitulo').pop()?.detalle).toBe('0→1 via boton sonar=true')
  })

  it('hoja de capítulos', async () => {
    const m = montar()
    await sonando(m)
    m.motor.irACapitulo(2)
    await esperar()
    sonandoCap(m, 2)
    expect(m.diario.filter((x) => x.tipo === 'cambio-capitulo').pop()?.detalle).toContain('via hoja')
  })

  it('fin de capítulo', async () => {
    const m = montar()
    await sonando(m)
    m.el.emitir('ended')
    await esperar()
    sonandoCap(m, 1)
    expect(m.tipos()).toContain('fin-capitulo')
    expect(m.diario.filter((x) => x.tipo === 'cambio-capitulo').pop()?.detalle).toContain('via fin')
  })

  it('Media Session: siguiente, anterior y seekto', async () => {
    const ms = conMediaSession()
    try {
      const m = montar()
      await sonando(m)
      ms.acciones.nexttrack?.()
      await esperar()
      sonandoCap(m, 1)
      expect(m.diario.filter((x) => x.tipo === 'cambio-capitulo').pop()?.detalle).toContain('via media-session')
      ms.acciones.previoustrack?.() // al principio del capítulo: el anterior
      await esperar()
      sonandoCap(m, 0)
      ms.acciones.seekto?.({ seekTime: 42 })
      expect(m.el.currentTime).toBe(42)
      expect(ms.posiciones[ms.posiciones.length - 1]).toEqual({ duration: 100, playbackRate: 1, position: 42 })
      ms.acciones.seekto?.({ seekTime: Number.NaN })
      expect(m.el.currentTime).toBe(42)
    } finally {
      ms.restaurar()
    }
  })

  it('dos cambios seguidos antes de que conteste el servidor: suena el ÚLTIMO pedido', async () => {
    const pendientes: { cap: number; r: (v: ResultDTO<EstadoAudioDTO>) => void }[] = []
    const m = montar({
      pedirEstado: jest.fn(
        (d) =>
          new Promise<ResultDTO<EstadoAudioDTO>>((r) => {
            if (d.capitulo === 0) r(listo(0))
            else pendientes.push({ cap: d.capitulo, r })
          }),
      ),
    })
    await sonando(m)
    m.motor.irACapitulo(1)
    m.motor.irACapitulo(2)
    // Contesta primero el 2 y luego, tarde, el 1: no debe pisarlo.
    pendientes.find((p) => p.cap === 2)?.r(listo(2))
    await esperar()
    pendientes.find((p) => p.cap === 1)?.r(listo(1))
    await esperar()
    sonandoCap(m, 2)
  })

  it('con el audio roto (error de audio), «siguiente» va al siguiente en vez de repetir el que falla', async () => {
    const m = montar()
    await sonando(m)
    m.el.error = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }
    m.el.emitir('error')
    expect(m.motor.obtener().tipoError).toBe('audio')
    expect(m.diario.find((x) => x.tipo === 'error-audio')?.detalle).toMatch(/^media 4 MEDIA_ERR_SRC_NOT_SUPPORTED/)
    m.motor.capituloSiguiente()
    await esperar()
    sonandoCap(m, 1)
  })

  it('tras una pausa del sistema, «siguiente» desde el centro de control sigue sonando en el nuevo', async () => {
    const ms = conMediaSession()
    try {
      const m = montar()
      await sonando(m)
      m.el.pause()
      ms.acciones.nexttrack?.()
      await esperar()
      sonandoCap(m, 1)
    } finally {
      ms.restaurar()
    }
  })
})

describe('C13 · Media Session al día y artwork del propio origen', () => {
  it('setPositionState con la duración, la posición y la velocidad; se limpia al cambiar de capítulo', async () => {
    const ms = conMediaSession()
    try {
      const m = montar()
      await sonando(m, 30)
      expect(ms.posiciones[ms.posiciones.length - 1]).toEqual({ duration: 100, playbackRate: 1, position: 30 })
      m.motor.setVelocidad(1.5)
      expect(ms.posiciones[ms.posiciones.length - 1]).toEqual({ duration: 100, playbackRate: 1.5, position: 30 })
      const n = ms.posiciones.length
      m.motor.irACapitulo(1)
      // Mientras llega el capítulo nuevo (sin duración), la barra del anterior se quita.
      expect(ms.posiciones.slice(n)).toContain(undefined)
      await esperar()
      expect(ms.posiciones[ms.posiciones.length - 1]).toMatchObject({ duration: 100, position: 0 })
    } finally {
      ms.restaurar()
    }
  })

  it('la portada de la API se sirve por el service worker desde el origen de la web; sin él, el icono', async () => {
    const api = 'https://casa.ejemplo:7051/BIBLIOTECA-SERVICE/biblioteca/v1/archivos/a1/portada.jpg?t=tok'
    const m = montar()
    m.motor.abrir(libro(api), { capitulo: 0, vozId: 'v', velocidad: 1, reproducir: false })
    const art = m.motor.artwork()
    expect(art[0].src).toBe(`https://web.casa:7050/__bah/portada?u=${encodeURIComponent(api)}`)
    expect(art.every((a) => a.src.startsWith('https://web.casa:7050/'))).toBe(true)
    const sinSw = montar({ conServiceWorker: () => false })
    sinSw.motor.abrir(libro(api), { capitulo: 0, vozId: 'v', velocidad: 1, reproducir: false })
    expect(sinSw.motor.artwork()).toEqual([
      { src: 'https://web.casa:7050/iconos/icono-512.png', sizes: '512x512', type: 'image/png' },
    ])
    const relativa = montar()
    relativa.motor.abrir(libro('/demo/libros/x/portada.svg'), { capitulo: 0, vozId: 'v', velocidad: 1 })
    expect(relativa.motor.artwork()[0]).toEqual({
      src: 'https://web.casa:7050/demo/libros/x/portada.svg',
      sizes: '600x900',
      type: 'image/svg+xml',
    })
  })
})

describe('C9 · lo que el motor anota en el diario', () => {
  it('inicio, fin de capítulo y fin del libro, con libro, capítulo y posición', async () => {
    const m = montar()
    m.motor.abrir(libro(), { capitulo: 2, posicion: 12, vozId: 'v', velocidad: 1.5 })
    await esperar()
    expect(m.diario[0]).toMatchObject({ tipo: 'inicio', ejemplarId: 'e1', capitulo: 2, posicion: 12 })
    m.el.currentTime = 99.9
    m.el.emitir('ended')
    expect(m.tipos()).toEqual(expect.arrayContaining(['fin-capitulo', 'fin-libro']))
  })

  it('sin red: «error-red» una sola vez por racha (no en cada reintento)', async () => {
    let red = false
    const m = montar({
      pedirEstado: jest.fn(async (d) => {
        if (!red) throw new Error('Network Error')
        return listo(d.capitulo)
      }),
    })
    m.motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    m.motor.reintentar()
    await esperar()
    m.motor.reintentar()
    await esperar()
    expect(m.tipos().filter((t) => t === 'error-red')).toHaveLength(1)
    red = true
    m.motor.reintentar()
    await esperar()
    expect(m.motor.obtener().fase).toBe('reproduciendo')
  })

  it('un capítulo LISTO sin red es «sin-conexion-uso» (lo sirvió la copia del dispositivo)', async () => {
    const m = montar({ red: { hay: false } })
    m.motor.abrir(libro(), { capitulo: 1, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(m.diario.find((x) => x.tipo === 'sin-conexion-uso')).toMatchObject({ capitulo: 1 })
    expect(m.motor.obtener().fase).toBe('reproduciendo')
  })

  it('un diario que revienta no para la voz', async () => {
    const m = montar({
      diario: () => {
        throw new Error('diario roto')
      },
    })
    await sonando(m)
    m.el.pause()
    m.verse(true)
    m.motor.capituloSiguiente()
    await esperar()
    expect(m.motor.obtener().capitulo).toBe(1)
    expect(m.el.paused).toBe(false)
  })

  it('sin red, el latido «al salir» va por la vía normal (que lo deja en la cola sin red)', async () => {
    const m = montar({ red: { hay: false } })
    await sonando(m)
    for (let i = 0; i < 20; i++) {
      m.avanzarReloj(250)
      m.el.currentTime += 0.25
      m.el.emitir('timeupdate')
    }
    m.motor.latir(false, true)
    await esperar()
    expect(m.latidos.pop()?.alSalir).toBe(false)
    m.red.hay = true
    for (let i = 0; i < 20; i++) {
      m.avanzarReloj(250)
      m.el.currentTime += 0.25
      m.el.emitir('timeupdate')
    }
    m.motor.latir(false, true)
    await esperar()
    expect(m.latidos.pop()?.alSalir).toBe(true)
  })
})
