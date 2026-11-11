import type { EstadoAudioDTO, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import { MENSAJES } from '@utils/mensajes'
import { DependenciasMotor, MotorAudio, SILENCIO } from '@utils/motorAudio'

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
