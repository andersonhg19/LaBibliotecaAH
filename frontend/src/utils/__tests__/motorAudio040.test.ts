/*
 * EL MOTOR DE LA VOZ EN 0.4.0 (auditoría 2-reproductor y Ola E): capítulos
 * apartados de la voz, temporizador que no corre en pausa, latido de la sesión,
 * resaltado que se recupera, fin de capítulo/libro con ▶, «+15 s» que cruza,
 * envolvente para la onda, sello de guardado y la cinta que no se apaga por un
 * corte de red. Con un <audio> y una cinta de mentira (la Cinta real se prueba
 * en cintaAdversarial.test.ts).
 */
import type { CapituloResumen, EstadoAudioDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import { ERROR_RED } from '@utils/fallosCinta'
import {
  DependenciasMotor,
  LatidoVoz,
  MotorAudio,
  TEXTOS_VOZ,
  faltaTemporizador,
  uuid,
  vecinoConVoz,
} from '@utils/motorAudio'

/** Un <audio> de mentira; como el de verdad, play() sobre uno que ya suena no dispara 'play'. */
class AudioFalso {
  src = ''
  currentTime = 0
  duration = 100
  playbackRate = 1
  defaultPlaybackRate = 1
  volume = 1
  paused = true
  preload = ''
  oyentes: Record<string, (() => void)[]> = {}
  addEventListener(t: string, f: () => void) {
    ;(this.oyentes[t] ??= []).push(f)
  }
  setAttribute() {}
  /** Los metadatos llegan en cuanto se carga (así el motor coloca la posición pendiente). */
  load() {
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

const TIEMPOS: TiemposCapitulo = {
  capitulo: 0,
  vozId: 'v',
  duracion: 100,
  frases: [
    { id: 'c000-s00000', t0: 0, t1: 9, palabras: [] },
    { id: 'c000-s00001', t0: 10, t1: 19, palabras: [] },
  ],
}

const caps = (...c: Partial<CapituloResumen>[]): CapituloResumen[] =>
  c.map((x, i) => ({ indice: i, titulo: `Cap ${i}`, minutos: 2, ...x }))

const libro = (capitulos: CapituloResumen[] = caps({}, {}, {})) => ({
  ejemplarId: 'e1',
  titulo: 'El guardián',
  autores: ['Biblioteca AH'],
  portadaUrl: null,
  capitulos,
})

const esperar = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

function montar(o: Partial<DependenciasMotor> = {}) {
  const el = new AudioFalso()
  let reloj = 1_000_000
  const latidos: LatidoVoz[] = []
  let volverLaRed: (() => void) | null = null
  const deps: DependenciasMotor = {
    crearAudio: () => el as unknown as HTMLAudioElement,
    pedirEstado: jest.fn(async (d) => listo(d.capitulo)),
    cargarTiempos: async () => TIEMPOS,
    guardarServidor: async () => ({ correct: true }),
    guardarLocal: async () => undefined,
    resolverUrl: (r) => r,
    dispositivo: () => 'PC',
    ahora: () => reloj,
    latido: async (d) => latidos.push(d),
    nuevoId: () => 'sesion-1',
    alVolverLaRed: (fn) => {
      volverLaRed = fn
      return () => {}
    },
    ...o,
  }
  const motor = new MotorAudio(deps)
  return {
    motor,
    el,
    latidos,
    deps,
    avanzarReloj: (ms: number) => (reloj += ms),
    volverLaRed: () => volverLaRed?.(),
  }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('Capítulos apartados de la voz (C3, D12)', () => {
  it('vecinoConVoz se salta enVoz=false y los de 0 minutos (también por minutosVoz)', () => {
    const l = caps({}, { enVoz: false }, { minutos: 0 }, { minutosVoz: 0 }, {}, { enVoz: true })
    expect(vecinoConVoz(l, 0, 1)).toBe(4)
    expect(vecinoConVoz(l, 4, -1)).toBe(0)
    expect(vecinoConVoz(l, 4, 1)).toBe(5)
    expect(vecinoConVoz(l, 5, 1)).toBe(-1)
    // Sin el campo (servidor viejo), como siempre.
    expect(vecinoConVoz(caps({}, {}), 0, 1)).toBe(1)
  })

  it('escuchando de corrido no pide ni precarga los apartados, y los salta al acabar', async () => {
    const { motor, el, deps } = montar()
    const pedir = deps.pedirEstado as jest.Mock
    motor.abrir(libro(caps({}, { enVoz: false }, { enVoz: false }, {})), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 70
    el.emitir('timeupdate')
    await esperar()
    // La precarga va directa al capítulo 3.
    expect(pedir.mock.calls.map((c) => c[0].capitulo)).toEqual([0, 3])
    el.emitir('ended')
    expect(motor.obtener().capitulo).toBe(3)
    expect(el.src).toBe('/a/cap-3.m4a')
  })

  it('elegido a mano, un capítulo apartado sí suena', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(caps({}, { enVoz: false }, {})), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.irACapitulo(1)
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
  })

  it('MAX_SALTOS no cuenta los apartados: tras tres apartados y dos en ERROR sigue con el siguiente', async () => {
    const error: ResultDTO<EstadoAudioDTO> = {
      correct: true,
      message: 'OK',
      errorCode: 0,
      object: { estado: 'ERROR', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null, error: 'x' },
    }
    const { motor, el } = montar({
      pedirEstado: jest.fn(async (d) => (d.capitulo === 4 || d.capitulo === 5 ? error : listo(d.capitulo))),
    })
    const l = caps({}, { enVoz: false }, { enVoz: false }, { enVoz: false }, {}, {}, {})
    motor.abrir(libro(l), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('ended')
    await esperar(12)
    expect(motor.obtener().capitulo).toBe(6)
    expect(motor.obtener().fase).not.toBe('error')
  })
})

describe('Fin de capítulo y fin del libro con ▶ (RP-01, RP-02, RP-09), sin cinta', () => {
  it('tras «Al final del capítulo», ▶ sigue con el siguiente (no relee este) y lo anuncia', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.setTemporizador('capitulo')
    el.emitir('ended')
    el.paused = true
    expect(motor.obtener().mensaje).toBe(TEXTOS_VOZ.finCapituloSigue('Cap 1'))
    motor.reproducir()
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(motor.obtener().fase).toBe('reproduciendo')
  })

  it('moverse dentro del capítulo tras el temporizador deshace el «parado al final»', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.setTemporizador('capitulo')
    el.emitir('ended')
    el.paused = true
    motor.buscar(30)
    motor.reproducir()
    await esperar()
    expect(motor.obtener().capitulo).toBe(0)
    expect(el.currentTime).toBe(30)
  })

  it('al acabar el libro lo dice y ▶ vuelve a oír el último desde el principio; «Volver a empezar» va al primero', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 2, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 99.9
    el.emitir('ended')
    el.paused = true
    expect(motor.obtener().finDelLibro).toBe(true)
    expect(motor.obtener().mensaje).toBe(TEXTOS_VOZ.finLibro)
    motor.reproducir()
    expect(el.currentTime).toBe(0)
    expect(motor.obtener().finDelLibro).toBe(false)
    expect(motor.obtener().fase).toBe('reproduciendo')
    motor.volverAEmpezar()
    await esperar()
    expect(motor.obtener().capitulo).toBe(0)
  })
})

describe('Temporizador por minutos (RP-14, D13)', () => {
  it('no cuenta con la voz en pausa y se reanuda al sonar', async () => {
    const { motor, el, avanzarReloj } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(motor.obtener().fase).toBe('reproduciendo')
    motor.setTemporizador({ minutos: 5 })
    avanzarReloj(60_000)
    motor.pausar()
    const t = motor.obtener().temporizador
    expect(t?.tipo === 'minutos' && t.pausadoCon).toBe(240_000)
    avanzarReloj(30 * 60_000) // media hora en pausa
    el.emitir('timeupdate')
    expect(motor.obtener().temporizador).not.toBeNull()
    expect(faltaTemporizador(motor.obtener().temporizador, 0)).toBe(240)
    motor.reproducir()
    expect(faltaTemporizador(motor.obtener().temporizador, 1_000_000 + 31 * 60_000)).toBe(240)
    avanzarReloj(241_000)
    el.emitir('timeupdate')
    expect(motor.obtener().temporizador).toBeNull()
    expect(el.paused).toBe(true)
  })

  it('puesto en pausa empieza a contar al sonar', async () => {
    const { motor } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1, reproducir: false })
    await esperar()
    motor.setTemporizador({ minutos: 10 })
    const t = motor.obtener().temporizador
    expect(t?.tipo === 'minutos' && t.pausadoCon).toBe(600_000)
  })
})

describe('Latido de la sesión de escucha (C4, D14)', () => {
  it('cada 60 s sonando manda los segundos escuchados; en pausa no; al pausar manda lo que quede', async () => {
    const { motor, el, latidos, avanzarReloj } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    for (let i = 0; i < 4 * 61; i++) {
      avanzarReloj(250)
      el.currentTime += 0.25
      el.emitir('timeupdate')
    }
    await esperar()
    expect(latidos).toHaveLength(1)
    expect(latidos[0]).toMatchObject({ ejemplarId: 'e1', modo: 'VOZ', sesionId: 'sesion-1', capitulo: 0, segundos: 60 })
    for (let i = 0; i < 40; i++) {
      avanzarReloj(250)
      el.currentTime += 0.25
      el.emitir('timeupdate')
    }
    motor.pausar()
    await esperar()
    expect(latidos).toHaveLength(2)
    expect(latidos[1].segundos).toBe(11)
    // En pausa, aunque pase el tiempo y llegue algún timeupdate, no se cuenta nada.
    avanzarReloj(5 * 60_000)
    el.emitir('timeupdate')
    motor.latir()
    await esperar()
    expect(latidos).toHaveLength(2)
  })

  it('un hueco grande entre timeupdates (página congelada) no infla la cuenta; nunca más de 120 s', async () => {
    const { motor, el, latidos, avanzarReloj } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    avanzarReloj(10 * 60_000)
    el.emitir('timeupdate')
    await esperar()
    expect(latidos[0].segundos).toBe(15)
    expect(latidos.every((l) => l.segundos <= 120)).toBe(true)
  })

  it('sin red, lo escuchado va en el siguiente latido', async () => {
    let falla = true
    const enviados: LatidoVoz[] = []
    const { motor, el, avanzarReloj } = montar({
      latido: async (d) => {
        if (falla) throw new Error('sin red')
        enviados.push(d)
      },
    })
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    for (let i = 0; i < 4 * 61; i++) {
      avanzarReloj(250)
      el.emitir('timeupdate')
    }
    await esperar()
    falla = false
    for (let i = 0; i < 4 * 61; i++) {
      avanzarReloj(250)
      el.emitir('timeupdate')
    }
    await esperar()
    expect(enviados).toHaveLength(1)
    expect(enviados[0].segundos).toBe(120)
  })

  it('uuid da un identificador v4', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('Resaltado que se recupera (RP-18, D10)', () => {
  it('si tiempos.json falla, se vuelve a pedir con espera creciente y al volver la red', async () => {
    let falla = true
    const cargarTiempos = jest.fn(async () => {
      if (falla) throw new Error('Failed to fetch')
      return TIEMPOS
    })
    const { motor, el, avanzarReloj, volverLaRed } = montar({ cargarTiempos })
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(cargarTiempos).toHaveBeenCalledTimes(1)
    el.currentTime = 12
    el.emitir('timeupdate') // aún no toca (espera de 2 s)
    await esperar()
    expect(cargarTiempos).toHaveBeenCalledTimes(1)
    avanzarReloj(5_000)
    el.emitir('timeupdate')
    await esperar()
    expect(cargarTiempos).toHaveBeenCalledTimes(2)
    falla = false
    volverLaRed()
    await esperar()
    expect(cargarTiempos).toHaveBeenCalledTimes(3)
    el.emitir('timeupdate')
    expect(motor.obtener().fraseId).toBe('c000-s00001')
  })
  it('D10 tres fallos seguidos y la red vuelve sola (sin evento online): resalta antes de 15 s', async () => {
    let fallos = 3
    const cargarTiempos = jest.fn(async () => {
      if (fallos-- > 0) throw new Error('Failed to fetch')
      return TIEMPOS
    })
    const { motor, el, avanzarReloj } = montar({ cargarTiempos })
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 12
    // Sonando: un timeupdate cada segundo de reloj, como el navegador.
    for (let s = 0; s < 15; s++) {
      avanzarReloj(1_000)
      el.emitir('timeupdate')
      await esperar()
    }
    expect(cargarTiempos).toHaveBeenCalledTimes(4)
    el.emitir('timeupdate')
    expect(motor.obtener().fraseId).toBe('c000-s00001')
  })
})

describe('«+15 s» cerca del final (RP-10) y estado al seguir sonando (RP-17)', () => {
  it('a 5 s del final, +15 s sigue 10 s dentro del capítulo siguiente ya precargado', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 95
    el.emitir('timeupdate')
    await esperar()
    motor.adelante15()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(motor.obtener().posicion).toBe(10)
  })

  it('sin precarga, +15 s se queda al final del capítulo (como antes)', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 50
    motor.buscar(95)
    motor.adelante15()
    expect(motor.obtener().capitulo).toBe(0)
    expect(motor.obtener().posicion).toBeCloseTo(99.95)
  })

  it('si el <audio> ya estaba en marcha, ▶ pone «reproduciendo» aunque no llegue el evento play', async () => {
    const { motor, el } = montar()
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1, reproducir: false })
    await esperar()
    expect(motor.obtener().fase).toBe('pausado')
    el.paused = false // sonando sin que el motor lo sepa (cinta que sigue sola tras saltar un capítulo)
    motor.reproducir()
    expect(motor.obtener().fase).toBe('reproduciendo')
  })
})

describe('Envolvente para la onda (C7, F7)', () => {
  it('da la energía en la posición actual (0–1) y null sin envolvente', async () => {
    const env: TiemposCapitulo = { ...TIEMPOS, envolvente: { hz: 10, v: [0, 50, 100, 20] } }
    const { motor, el } = montar({ cargarTiempos: async (u) => (u.includes('cap-0') ? env : TIEMPOS) })
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 0.15
    expect(motor.nivelVoz()).toBe(0.5)
    el.currentTime = 0.25
    expect(motor.nivelVoz()).toBe(1)
    el.currentTime = 50 // más allá: el último valor
    expect(motor.nivelVoz()).toBe(0.2)
    motor.irACapitulo(1)
    await esperar()
    expect(motor.nivelVoz()).toBeNull()
  })
})

describe('Sello de guardado (F10)', () => {
  it('dice «guardado» con la hora cuando el servidor confirma y «pendiente» sin red; reintenta al volver la red', async () => {
    let falla = true
    const guardarServidor = jest.fn(async () => {
      if (falla) throw new Error('Network Error')
      return { correct: true }
    })
    const { motor, volverLaRed } = montar({ guardarServidor })
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.pausar()
    await esperar()
    expect(motor.obtener().guardado?.estado).toBe('pendiente')
    falla = false
    volverLaRed()
    await esperar()
    expect(motor.obtener().guardado).toEqual({ estado: 'ok', en: 1_000_000 })
  })
})

/** Una cinta de mentira que puede fallar al cargar. */
class CintaFalsa {
  tramos: { clave: string; inicio: number; fin: number }[] = []
  actual: { clave: string; inicio: number; fin: number } | null = null
  cargas: string[] = []
  fallar: Error[] = []
  soltadas = 0
  alCerrarse: (() => void) | null = null
  constructor(private el: AudioFalso) {}
  get puesta() {
    return this.el.src === 'blob:cinta'
  }
  siguienteDe(t: unknown) {
    const i = this.tramos.indexOf(t as never)
    return i >= 0 ? (this.tramos[i + 1] ?? null) : null
  }
  tiempo() {
    return this.actual ? this.el.currentTime - this.actual.inicio : 0
  }
  async cargar(url: string, t: number) {
    this.cargas.push(url)
    const e = this.fallar.shift()
    if (e) throw e
    this.el.src = 'blob:cinta'
    this.actual = { clave: url, inicio: 0, fin: 100 }
    this.tramos = [this.actual]
    this.el.currentTime = t
    return this.actual
  }
  async encolar() {
    return null
  }
  olvidarSiguientes() {}
  avanzar() {
    return null
  }
  irA(t: number) {
    if (this.actual) this.el.currentTime = this.actual.inicio + t
  }
  bomba() {}
  soltar() {
    this.soltadas++
    this.actual = null
    this.tramos = []
    this.el.src = ''
  }
}

describe('La cinta ante fallos (RP-04, RP-08, D5, D9)', () => {
  function conCinta(fallos: Error[]) {
    let cinta: CintaFalsa | null = null
    const m = montar({
      cinta: (e) => {
        cinta = new CintaFalsa(e as unknown as AudioFalso)
        cinta.fallar = fallos
        return cinta as never
      },
    })
    return { ...m, cinta: () => cinta as unknown as CintaFalsa }
  }
  const red = () => Object.assign(new Error('red: Failed to fetch'), { name: ERROR_RED })

  it('un corte de red no apaga la cinta: lo dice, reintenta solo y vuelve a sonar en ella', async () => {
    jest.useFakeTimers()
    try {
      const { motor, el, cinta } = conCinta([red()])
      motor.abrir(libro(), { capitulo: 0, posicion: 30, vozId: 'v', velocidad: 1 })
      await jest.advanceTimersByTimeAsync(0)
      expect(motor.obtener().fase).toBe('error')
      expect(motor.obtener().tipoError).toBe('red')
      expect(motor.obtener().escuchaContinua).toBe('activa')
      await jest.advanceTimersByTimeAsync(2_100)
      expect(cinta().cargas).toEqual(['/a/cap-0.m4a', '/a/cap-0.m4a'])
      expect(el.src).toBe('blob:cinta')
      expect(el.currentTime).toBe(30)
      expect(motor.obtener().fase).toBe('reproduciendo')
    } finally {
      jest.useRealTimers()
    }
  })

  it('un 401/404 se vuelve a pedir una vez al servidor (URL con token nuevo); si sigue, «no se pudo cargar»', async () => {
    const { motor, deps, cinta } = conCinta([new Error('audio 401'), new Error('audio 401')])
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar(8)
    expect((deps.pedirEstado as jest.Mock).mock.calls).toHaveLength(2)
    expect(cinta().cargas).toHaveLength(2)
    expect(motor.obtener().tipoError).toBe('audio')
    expect(motor.obtener().escuchaContinua).toBe('activa')
  })

  it('dos fallos de la plataforma seguidos la apagan (con aviso) y sigue con el <audio> normal', async () => {
    const { motor, el, cinta } = conCinta([new Error('mp4: ilegible'), new Error('mp4: ilegible')])
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar(8)
    expect(cinta().cargas).toHaveLength(2)
    expect(motor.obtener().escuchaContinua).toBe('apagada')
    expect(el.src).toBe('/a/cap-0.m4a')
  })

  it('si el navegador cierra la cinta, se rehace en la misma posición y sigue sonando', async () => {
    const { motor, el, cinta } = conCinta([])
    motor.abrir(libro(), { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.currentTime = 42
    el.emitir('timeupdate')
    cinta().soltar()
    el.paused = true
    cinta().alCerrarse?.()
    await esperar()
    expect(cinta().cargas).toEqual(['/a/cap-0.m4a', '/a/cap-0.m4a'])
    expect(el.src).toBe('blob:cinta')
    expect(el.currentTime).toBe(42)
    expect(motor.obtener().fase).toBe('reproduciendo')
  })
})
