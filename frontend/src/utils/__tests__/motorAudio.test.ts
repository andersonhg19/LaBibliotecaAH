import type { EstadoAudioDTO, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import { MENSAJES } from '@utils/mensajes'
import {
  DependenciasMotor,
  MotorAudio,
  SILENCIO,
  acotar,
  estimarPreparacion,
  faltaParaEstar,
  textoEspera,
} from '@utils/motorAudio'

/** Un <audio> de mentira: lo justo para que el motor crea que suena. */
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
  load() {}
  emitir(t: string) {
    ;(this.oyentes[t] ?? []).forEach((f) => f())
  }
  play() {
    this.paused = false
    this.emitir('play')
    return Promise.resolve()
  }
  pause() {
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
const generando: ResultDTO<EstadoAudioDTO> = {
  correct: true,
  message: 'OK',
  errorCode: 0,
  object: { estado: 'GENERANDO', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null },
}

const TIEMPOS: TiemposCapitulo = {
  capitulo: 0,
  vozId: 'v',
  duracion: 100,
  frases: [
    { id: 'c000-s00000', t0: 0, t1: 9, palabras: [[0, 4, 0.1, 0.5]] },
    { id: 'c000-s00001', t0: 10, t1: 19, palabras: [] },
    { id: 'c000-s00002', t0: 20, t1: 29, palabras: [] },
  ],
}

const LIBRO = {
  ejemplarId: 'e1',
  titulo: 'El guardián',
  autores: ['Biblioteca AH'],
  portadaUrl: null,
  capitulos: [
    { indice: 0, titulo: 'Uno', minutos: 2 },
    { indice: 1, titulo: 'Dos', minutos: 2 },
  ],
}

const esperar = () => new Promise((r) => setTimeout(r, 0))

function montar(pedir: DependenciasMotor['pedirEstado'] = async (d) => listo(d.capitulo)) {
  const el = new AudioFalso()
  let reloj = 1_000_000
  const servidor: ProgresoDTO[] = []
  const motor = new MotorAudio({
    crearAudio: () => el as unknown as HTMLAudioElement,
    pedirEstado: jest.fn(pedir),
    cargarTiempos: async () => TIEMPOS,
    guardarServidor: async (p) => servidor.push(p),
    guardarLocal: async () => undefined,
    resolverUrl: (r) => r,
    dispositivo: () => 'PC',
    ahora: () => reloj,
  })
  return { motor, el, servidor, avanzarReloj: (ms: number) => (reloj += ms) }
}

describe('El motor de la voz', () => {
  it('usa UN solo <audio>: lo desbloquea con silencio en el primer toque', () => {
    const { motor, el } = montar()
    motor.desbloquear()
    expect(el.src).toBe(SILENCIO)
  })

  it('a 1x suena el archivo 1x; a 3x el 2x a 1.5 conservando la posición', async () => {
    const { motor, el } = montar()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 40, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(el.src).toBe('/a/cap-0.m4a')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(40)
    motor.setVelocidad(3)
    expect(el.src).toBe('/a/cap-0-2x.m4a')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(20)
    expect(el.playbackRate).toBe(1.5)
    expect(motor.posicion()).toBe(40)
    motor.setVelocidad(4)
    expect(el.playbackRate).toBe(2)
    expect(el.src).toBe('/a/cap-0-2x.m4a')
  })

  it('mientras la voz se genera dice "Preparando la voz de Álvaro…" y vuelve a preguntar', async () => {
    jest.useFakeTimers()
    let veces = 0
    const { motor } = montar(async (d) => (++veces < 2 ? generando : listo(d.capitulo)))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'edge.es-ES-AlvaroNeural', nombreVoz: 'Álvaro', velocidad: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(motor.obtener().fase).toBe('preparando')
    expect(motor.obtener().mensaje).toBe(MENSAJES.vozPreparando('Álvaro'))
    await jest.advanceTimersByTimeAsync(3100)
    expect(veces).toBe(2)
    expect(motor.obtener().fase).toBe('reproduciendo')
    jest.useRealTimers()
  })

  it('si el libro aún se convierte (CONVIRTIENDO) lo dice y sigue preguntando', async () => {
    jest.useFakeTimers()
    let veces = 0
    const convirtiendo: ResultDTO<EstadoAudioDTO> = {
      ...generando,
      object: { ...generando.object!, estado: 'CONVIRTIENDO' },
    }
    const { motor } = montar(async (d) => (++veces < 2 ? convirtiendo : listo(d.capitulo)))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'edge.es-ES-AlvaroNeural', nombreVoz: 'Álvaro', velocidad: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(motor.obtener().fase).toBe('preparando')
    expect(motor.obtener().mensaje).toBe(MENSAJES.libroConvirtiendo)
    await jest.advanceTimersByTimeAsync(3100)
    expect(veces).toBe(2)
    expect(motor.obtener().fase).toBe('reproduciendo')
    jest.useRealTimers()
  })

  it('si el libro no se pudo convertir (ERROR_CONVERSION) se detiene con un mensaje claro', async () => {
    jest.useFakeTimers()
    let veces = 0
    const fallo: ResultDTO<EstadoAudioDTO> = {
      ...generando,
      object: { ...generando.object!, estado: 'ERROR_CONVERSION' },
    }
    const { motor } = montar(async () => {
      veces++
      return fallo
    })
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'edge.es-ES-AlvaroNeural', nombreVoz: 'Álvaro', velocidad: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().mensaje).toBe(MENSAJES.libroNoConvertido)
    await jest.advanceTimersByTimeAsync(10000)
    expect(veces).toBe(1)
    jest.useRealTimers()
  })

  it('al terminar un capítulo cambia el src del MISMO elemento al siguiente y sigue', async () => {
    const { motor, el } = montar()
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('ended')
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(el.paused).toBe(false)
  })

  it('escuchando de corrido pasa de largo una página vacía y un capítulo en ERROR (2026-11-12, «Sección 4»)', async () => {
    const libro = {
      ...LIBRO,
      capitulos: [
        { indice: 0, titulo: 'Créditos', minutos: 1 },
        { indice: 1, titulo: 'Sección 2', minutos: 0 },
        { indice: 2, titulo: 'Dedicatoria', minutos: 1 },
        { indice: 3, titulo: '1 • El comienzo', minutos: 20 },
      ],
    }
    const { motor, el } = montar(async (d) =>
      d.capitulo === 2
        ? {
            correct: true,
            message: 'OK',
            errorCode: 0,
            object: {
              estado: 'ERROR',
              error: 'No se pudo.',
              duracionSeg: null,
              url1x: null,
              url2x: null,
              urlTiempos: null,
            },
          }
        : listo(d.capitulo),
    )
    motor.abrir(libro, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('ended')
    await esperar()
    await esperar()
    expect(motor.obtener().capitulo).toBe(3)
    expect(motor.obtener().fase).not.toBe('error')
    expect(el.src).toBe('/a/cap-3.m4a')
  })

  it('elegido a mano, un capítulo en ERROR sí se dice (no se salta)', async () => {
    const { motor } = montar(async () => ({
      correct: true,
      message: 'OK',
      errorCode: 0,
      object: { estado: 'ERROR', error: 'No se pudo.', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null },
    }))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().capitulo).toBe(0)
  })

  it('«Capítulo siguiente» se salta las páginas vacías', async () => {
    const { motor } = montar()
    const libro = {
      ...LIBRO,
      capitulos: [
        { indice: 0, titulo: 'A', minutos: 2 },
        { indice: 1, titulo: 'Sección 2', minutos: 0 },
        { indice: 2, titulo: 'B', minutos: 2 },
      ],
    }
    motor.abrir(libro, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.capituloSiguiente()
    await esperar()
    expect(motor.obtener().capitulo).toBe(2)
  })

  it('salta por frase con tiempos.json', async () => {
    const { motor, el } = montar()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 12, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    motor.fraseSiguiente()
    expect(el.currentTime).toBe(20)
    motor.fraseAnterior()
    expect(el.currentTime).toBe(10)
  })

  it('"escuchar desde aquí" va a la frase pedida', async () => {
    const { motor, el } = montar()
    motor.abrir(LIBRO, { capitulo: 0, fraseId: 'c000-s00002', vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    el.emitir('loadedmetadata')
    expect(motor.posicion()).toBe(20)
  })

  it('tras una pausa de más de 5 min retrocede una frase', async () => {
    const { motor, el, avanzarReloj } = montar()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 25, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    motor.pausar()
    avanzarReloj(6 * 60 * 1000)
    motor.reproducir()
    expect(el.currentTime).toBe(10)
  })

  it('el temporizador funde y apaga', async () => {
    const { motor, el, avanzarReloj } = montar()
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    motor.setTemporizador({ minutos: 5 })
    avanzarReloj(5 * 60 * 1000 - 5000)
    el.emitir('timeupdate')
    expect(el.volume).toBeCloseTo(0.5, 1)
    avanzarReloj(6000)
    el.emitir('timeupdate')
    expect(el.paused).toBe(true)
    expect(motor.obtener().temporizador).toBeNull()
  })

  it('guarda el progreso de la voz al pausar (modo VOZ, con voz y velocidad)', async () => {
    const { motor, el, servidor } = montar()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 12, vozId: 'v', velocidad: 1.5 })
    await esperar()
    el.emitir('loadedmetadata')
    motor.pausar()
    const ultimo = servidor[servidor.length - 1]
    expect(ultimo).toMatchObject({
      ejemplarId: 'e1',
      capitulo: 0,
      modo: 'VOZ',
      vozId: 'v',
      velocidad: 1.5,
      posicionAudioSeg: 12,
      dispositivo: 'PC',
    })
  })
})

/* ------------------------------------------------------------------ regresiones del QA lector/voz */

const LIBRO3 = {
  ...LIBRO,
  capitulos: [
    { indice: 0, titulo: 'Uno', minutos: 2 },
    { indice: 1, titulo: 'Dos', minutos: 3 },
    { indice: 2, titulo: 'Tres', minutos: 2 },
  ],
}

/** LISTO con la voz en la URL, para distinguir qué voz suena. */
const listoVoz = (vozId: string, cap: number): ResultDTO<EstadoAudioDTO> => ({
  ...listo(cap),
  object: { ...listo(cap).object!, url1x: `/a/${vozId}/cap-${cap}.m4a`, url2x: `/a/${vozId}/cap-${cap}-2x.m4a` },
})
const errorCapitulo = (error: string): ResultDTO<EstadoAudioDTO> => ({
  ...generando,
  object: { ...generando.object!, estado: 'ERROR', error },
})

describe('QA LV-02: un corte de red o un capítulo fallido no dejan la voz muerta', () => {
  afterEach(() => jest.useRealTimers())

  it('sin red al pasar de capítulo, ▶ reintenta ESE capítulo y suena', async () => {
    let red = true
    const { motor, el } = montar(async (d) => {
      if (!red) throw new Error('Network Error')
      return listo(d.capitulo)
    })
    motor.abrir(LIBRO3, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    red = false
    el.emitir('ended')
    await esperar()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().capitulo).toBe(1)
    red = true
    motor.reproducir()
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(el.paused).toBe(false)
    expect(motor.obtener().fase).toBe('reproduciendo')
    motor.detener()
  })

  it('sin red se reintenta solo, con espera creciente', async () => {
    jest.useFakeTimers()
    let veces = 0
    const { motor } = montar(async (d) => {
      veces++
      if (veces < 3) throw new Error('Network Error')
      return listo(d.capitulo)
    })
    motor.abrir(LIBRO3, { capitulo: 1, vozId: 'v', velocidad: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().tipoError).toBe('red')
    await jest.advanceTimersByTimeAsync(2100)
    expect(veces).toBe(2)
    await jest.advanceTimersByTimeAsync(4100)
    expect(veces).toBe(3)
    expect(motor.obtener().fase).toBe('reproduciendo')
  })

  it('«Capítulo siguiente» no se salta el capítulo que no se pudo oír', async () => {
    let red = true
    const { motor, el } = montar(async (d) => {
      if (!red) throw new Error('Network Error')
      return listo(d.capitulo)
    })
    motor.abrir(LIBRO3, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    red = false
    el.emitir('ended')
    await esperar()
    red = true
    motor.capituloSiguiente()
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(el.paused).toBe(false)
    motor.detener()
  })

  it('capítulo en ERROR (v1.2): dice el porqué, no insiste solo y «Reintentar» lo pide explícitamente', async () => {
    jest.useFakeTimers()
    let falla = true
    const pedir = jest.fn(async (d: { capitulo: number }) =>
      falla ? errorCapitulo('El motor de voz no respondió.') : listo(d.capitulo),
    )
    const { motor } = montar(pedir)
    motor.abrir(LIBRO3, { capitulo: 1, vozId: 'v', velocidad: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().tipoError).toBe('capitulo')
    expect(motor.obtener().mensaje).toContain('El motor de voz no respondió.')
    await jest.advanceTimersByTimeAsync(60_000)
    expect(pedir).toHaveBeenCalledTimes(1)
    falla = false
    motor.reintentar()
    await jest.advanceTimersByTimeAsync(10)
    expect(pedir).toHaveBeenCalledTimes(2)
    expect((pedir.mock.calls[1] as unknown[])[1]).toEqual({ reintentar: true })
    expect(motor.obtener().fase).toBe('reproduciendo')
  })

  it('si el archivo no carga, ▶ lo vuelve a pedir desde donde iba', async () => {
    const { motor, el } = montar()
    motor.abrir(LIBRO3, { capitulo: 0, posicion: 30, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    el.emitir('error')
    expect(motor.obtener().fase).toBe('error')
    el.src = ''
    motor.reproducir()
    await esperar()
    el.emitir('loadedmetadata')
    expect(el.src).toBe('/a/cap-0.m4a')
    expect(el.currentTime).toBe(30)
    expect(motor.obtener().fase).toBe('reproduciendo')
    motor.detener()
  })
})

describe('QA LV-03: al cerrar o caducar la sesión la voz se calla y se olvida', () => {
  it('detener({ servidor: false }) para, guarda solo en el teléfono y deja el motor vacío', async () => {
    const guardadosLocales: ProgresoDTO[] = []
    const el = new AudioFalso()
    const servidor: ProgresoDTO[] = []
    const motor = new MotorAudio({
      crearAudio: () => el as unknown as HTMLAudioElement,
      pedirEstado: async (d) => listo(d.capitulo),
      cargarTiempos: async () => TIEMPOS,
      guardarServidor: async (p) => servidor.push(p),
      guardarLocal: async (p) => guardadosLocales.push(p),
      resolverUrl: (r) => r,
      dispositivo: () => 'PC',
      ahora: () => 1_000_000,
    })
    motor.abrir(LIBRO, { capitulo: 0, posicion: 12, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    servidor.length = 0
    motor.detener({ servidor: false })
    expect(el.paused).toBe(true)
    expect(servidor).toHaveLength(0)
    expect(guardadosLocales[guardadosLocales.length - 1]).toMatchObject({ ejemplarId: 'e1', posicionAudioSeg: 12 })
    expect(motor.obtener().libro).toBeNull()
    expect(motor.obtener().fase).toBe('inactivo')
    motor.reproducir()
    expect(el.paused).toBe(true)
  })
})

describe('QA LV-07 y LV-09: cambiar de voz', () => {
  afterEach(() => jest.useRealTimers())

  it('con la voz sonando, la actual sigue hasta que la nueva está lista y cambia en la misma frase', async () => {
    jest.useFakeTimers()
    let tomasListo = false
    const { motor, el } = montar(async (d) =>
      d.vozId === 'tomas' && !tomasListo ? generando : listoVoz(d.vozId, d.capitulo),
    )
    motor.abrir(LIBRO, { capitulo: 0, posicion: 12, vozId: 'alvaro', nombreVoz: 'Álvaro', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    el.emitir('loadedmetadata')
    expect(motor.obtener().fraseId).toBe('c000-s00001')
    motor.setVoz('tomas', 'Tomás')
    await jest.advanceTimersByTimeAsync(10)
    expect(el.paused).toBe(false)
    expect(el.src).toBe('/a/alvaro/cap-0.m4a')
    expect(motor.obtener().fase).toBe('reproduciendo')
    expect(motor.obtener().vozPendiente).toMatchObject({ id: 'tomas', nombre: 'Tomás' })
    tomasListo = true
    await jest.advanceTimersByTimeAsync(3100)
    el.emitir('loadedmetadata')
    expect(el.src).toBe('/a/tomas/cap-0.m4a')
    expect(motor.obtener().vozId).toBe('tomas')
    expect(motor.obtener().vozPendiente).toBeNull()
    expect(el.currentTime).toBe(10)
    expect(el.paused).toBe(false)
  })

  it('volver a la voz que suena mientras se prepara otra cancela el cambio y no la pausa', async () => {
    jest.useFakeTimers()
    const { motor, el } = montar(async (d) => (d.vozId === 'tomas' ? generando : listoVoz(d.vozId, d.capitulo)))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'alvaro', nombreVoz: 'Álvaro', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    motor.setVoz('tomas', 'Tomás')
    await jest.advanceTimersByTimeAsync(10)
    motor.setVoz('alvaro', 'Álvaro')
    await jest.advanceTimersByTimeAsync(10_000)
    expect(motor.obtener().vozPendiente).toBeNull()
    expect(motor.obtener().vozId).toBe('alvaro')
    expect(el.paused).toBe(false)
    expect(motor.obtener().fase).toBe('reproduciendo')
  })

  it('en pausa, al quedar lista la nueva voz desaparece «Preparando…» (LV-09)', async () => {
    jest.useFakeTimers()
    let veces = 0
    const { motor, el } = montar(async (d) =>
      d.vozId === 'gonzalo' && ++veces < 2 ? generando : listoVoz(d.vozId, d.capitulo),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'alvaro', nombreVoz: 'Álvaro', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    motor.pausar()
    motor.setVoz('gonzalo', 'Gonzalo')
    await jest.advanceTimersByTimeAsync(10)
    expect(motor.obtener().fase).toBe('preparando')
    expect(motor.obtener().mensaje).toBe(MENSAJES.vozPreparando('Gonzalo'))
    await jest.advanceTimersByTimeAsync(3100)
    expect(el.src).toBe('/a/gonzalo/cap-0.m4a')
    expect(motor.obtener().fase).toBe('pausado')
    expect(motor.obtener().mensaje).toBeNull()
    expect(el.paused).toBe(true)
  })
})

describe('La espera del taller se cuenta (UX-11)', () => {
  it('estima por los minutos del capítulo o usa la del servidor', () => {
    expect(estimarPreparacion(3)).toBe(22)
    expect(estimarPreparacion(3, 95)).toBe(95)
  })
  it('dice cuánto falta y, si se pasa, que tarda más de lo normal', () => {
    const e = { desde: 0, estimadoSeg: 22 }
    expect(textoEspera('Preparando la voz de Álvaro…', e, 0)).toBe('Preparando la voz de Álvaro… (≈ 25 s)')
    expect(textoEspera('Preparando la voz de Álvaro…', { desde: 0, estimadoSeg: 150 }, 0)).toBe(
      'Preparando la voz de Álvaro… (≈ 3 min)',
    )
    expect(textoEspera('Preparando la voz de Álvaro…', e, 30_000)).toMatch(/tarda más de lo normal/)
    expect(faltaParaEstar(e, 30_000)).toBeNull()
  })
  it('mientras prepara, el estado trae la espera para pintarla', async () => {
    const { motor } = montar(async () => generando)
    motor.abrir(LIBRO3, { capitulo: 1, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(motor.obtener().preparacion).toEqual({ desde: 1_000_000, estimadoSeg: estimarPreparacion(3) })
    motor.detener()
  })
})

describe('Contrato v1.2 del progreso', () => {
  it('a 5x el progreso guarda 5 (el servidor acepta 0.25–5) y todo finito', async () => {
    const { motor, el, servidor } = montar()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 12, vozId: 'v', velocidad: 5 })
    await esperar()
    el.emitir('loadedmetadata')
    expect(motor.obtener().velocidad).toBe(5)
    motor.pausar()
    const p = servidor[servidor.length - 1]
    expect(p.velocidad).toBe(5)
    expect(Number.isFinite(p.porcentaje) && p.porcentaje >= 0 && p.porcentaje <= 100).toBe(true)
    expect(p.posicionAudioSeg).toBeGreaterThanOrEqual(0)
  })
  it('acotar deja los valores dentro del rango y cambia NaN por el de por defecto', () => {
    expect(acotar(5, 0.25, 4, 1)).toBe(4)
    expect(acotar(Number.NaN, 0, 100, 0)).toBe(0)
    expect(acotar(-3, 0, 100, 0)).toBe(0)
  })
})

describe('Pasar de capítulo sin esperar al servidor (2026-11-12, iPhone bloqueado)', () => {
  it('a 45 s del final pide el siguiente y, al acabar, cambia el src y da ▶ en el MISMO ended', async () => {
    const { motor, el } = montar()
    const pedir = (motor as unknown as { deps: DependenciasMotor }).deps.pedirEstado as jest.Mock
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    expect(pedir).toHaveBeenCalledTimes(1)
    el.currentTime = 70
    el.emitir('timeupdate')
    await esperar()
    expect(pedir).toHaveBeenCalledTimes(2)
    expect(pedir.mock.calls[1][0]).toEqual({ ejemplarId: 'e1', vozId: 'v', capitulo: 1 })
    el.emitir('ended')
    // Sin esperar nada: el cambio ocurre dentro del propio 'ended'.
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(el.paused).toBe(false)
    expect(motor.obtener().capitulo).toBe(1)
    await esperar()
    expect(pedir).toHaveBeenCalledTimes(2)
  })

  it('si el siguiente aún no estaba LISTO, al acabar se pide como siempre', async () => {
    let veces = 0
    const { motor, el } = montar(async (d) => {
      veces++
      return d.capitulo === 1 && veces === 2 ? generando : listo(d.capitulo)
    })
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    el.emitir('loadedmetadata')
    el.currentTime = 70
    el.emitir('timeupdate')
    await esperar()
    el.emitir('ended')
    await esperar()
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('/a/cap-1.m4a')
    expect(veces).toBe(3)
  })

  it('con «al final del capítulo» no se precarga ni se sigue', async () => {
    const { motor, el } = montar()
    const pedir = (motor as unknown as { deps: DependenciasMotor }).deps.pedirEstado as jest.Mock
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    motor.setTemporizador('capitulo')
    el.currentTime = 70
    el.emitir('timeupdate')
    await esperar()
    expect(pedir).toHaveBeenCalledTimes(1)
    el.emitir('ended')
    expect(motor.obtener().capitulo).toBe(0)
    expect(motor.obtener().fase).toBe('pausado')
  })
})

/** Una cinta de mentira: lo justo para ver que el motor cuenta bien sin tocar el src. */
class CintaFalsa {
  tramos: { clave: string; inicio: number; fin: number }[] = []
  actual: { clave: string; inicio: number; fin: number } | null = null
  cargas: string[] = []
  encoladas: string[] = []
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
    this.el.src = 'blob:cinta'
    this.actual = { clave: url, inicio: 0, fin: 100 }
    this.tramos = [this.actual]
    this.el.currentTime = t
    return this.actual
  }
  async encolar(url: string) {
    this.encoladas.push(url)
    const u = this.tramos[this.tramos.length - 1]
    const t = { clave: url, inicio: u.fin, fin: u.fin + 100 }
    this.tramos.push(t)
    return t
  }
  olvidarSiguientes() {
    this.tramos = this.tramos.slice(0, this.tramos.indexOf(this.actual as never) + 1)
  }
  avanzar() {
    const s = this.siguienteDe(this.actual)
    if (s) this.actual = s
    return s
  }
  irA(t: number) {
    if (this.actual) this.el.currentTime = this.actual.inicio + t
  }
  bomba() {}
  soltar() {
    this.actual = null
    this.tramos = []
  }
}

describe('La cinta continua (iPhone)', () => {
  function montarConCinta() {
    const el = new AudioFalso()
    let cinta: CintaFalsa | null = null
    const motor = new MotorAudio({
      crearAudio: () => el as unknown as HTMLAudioElement,
      pedirEstado: jest.fn(async (d) => listo(d.capitulo)),
      cargarTiempos: async () => TIEMPOS,
      guardarServidor: async () => undefined,
      guardarLocal: async () => undefined,
      resolverUrl: (r) => r,
      dispositivo: () => 'iPhone',
      ahora: () => 1_000_000,
      cinta: (e) => (cinta = new CintaFalsa(e as unknown as AudioFalso)) as never,
    })
    return { motor, el, cinta: () => cinta as unknown as CintaFalsa }
  }

  it('pone el capítulo en la cinta, encola el siguiente y pasa a él SIN cambiar el src', async () => {
    const { motor, el, cinta } = montarConCinta()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 10, vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    expect(cinta().cargas).toEqual(['/a/cap-0.m4a'])
    expect(el.src).toBe('blob:cinta')
    expect(el.currentTime).toBe(10)
    expect(motor.posicion()).toBe(10)
    el.currentTime = 70
    el.emitir('timeupdate')
    await esperar()
    await esperar()
    expect(cinta().encoladas).toEqual(['/a/cap-1.m4a'])
    // El audio cruza solo al tramo siguiente; el motor solo cambia la cuenta.
    el.currentTime = 100.5
    el.emitir('timeupdate')
    expect(motor.obtener().capitulo).toBe(1)
    expect(el.src).toBe('blob:cinta')
    expect(motor.posicion()).toBeCloseTo(0.5)
    expect(cinta().cargas).toHaveLength(1)
  })

  it('a 3x usa el archivo 2x en la cinta y la posición sigue en la línea 1x', async () => {
    const { motor, el, cinta } = montarConCinta()
    motor.abrir(LIBRO, { capitulo: 0, posicion: 40, vozId: 'v', velocidad: 3 })
    await esperar()
    await esperar()
    expect(cinta().cargas).toEqual(['/a/cap-0-2x.m4a'])
    expect(el.currentTime).toBe(20)
    expect(motor.posicion()).toBe(40)
    motor.buscar(60)
    expect(el.currentTime).toBe(30)
  })
})
