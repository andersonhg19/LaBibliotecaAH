import type { EstadoAudioDTO, PartesCapitulo, ResultDTO, TiemposCapitulo } from '@tipos'
import { MotorAudio, TEXTOS_VOZ } from '@utils/motorAudio'

/*
 * v1.5 (contratos §6 bis): mientras el taller genera un capítulo, el motor
 * suena por partes en el MISMO <audio> y pasa al archivo entero cuando está.
 */

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
  /** Lo que hace el navegador al llegar al final: pausa y 'ended'. */
  acabar() {
    this.paused = true
    this.emitir('pause')
    this.emitir('ended')
  }
}

const generando: ResultDTO<EstadoAudioDTO> = {
  correct: true,
  message: 'OK',
  errorCode: 0,
  object: { estado: 'GENERANDO', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null },
}
const conPartes: ResultDTO<EstadoAudioDTO> = {
  ...generando,
  object: { ...generando.object, urlPartes: '/a/cap-000.partes.json?t=x' },
}
const listo: ResultDTO<EstadoAudioDTO> = {
  ...generando,
  object: {
    estado: 'LISTO',
    duracionSeg: 100,
    url1x: '/a/cap-0.m4a',
    url2x: '/a/cap-0-2x.m4a',
    urlTiempos: '/a/cap-0.tiempos.json',
  },
}
const fallo: ResultDTO<EstadoAudioDTO> = {
  ...generando,
  object: { ...generando.object, estado: 'ERROR', error: 'El servicio de voz no respondió.' },
}

const frase = (n: number, t0: number, t1: number) => ({
  id: `c000-s${String(n).padStart(5, '0')}`,
  t0,
  t1,
  palabras: [] as [number, number, number, number][],
})
const FRASES = [frase(0, 0, 9), frase(1, 10, 19), frase(2, 20, 29), frase(3, 30, 49)]
const parte = (n: number, t0: number, t1: number) => ({ n, archivo: `cap-000.parte-00${n}.m4a`, t0, t1 })
const PARTES = [parte(0, 0, 9), parte(1, 10, 29), parte(2, 30, 49)]
const HASTA_FRASE = [1, 3, 4]

const manifiesto = (n: number, completo = false): PartesCapitulo => ({
  versionFormato: 1,
  capitulo: 0,
  vozId: 'v',
  completo,
  duracionEstimada: 100,
  partes: PARTES.slice(0, n),
  frases: FRASES.slice(0, HASTA_FRASE[n - 1]),
})

const TIEMPOS: TiemposCapitulo = { capitulo: 0, vozId: 'v', duracion: 100, frases: FRASES }

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

function montar(
  estados: () => ResultDTO<EstadoAudioDTO>,
  partes: (() => PartesCapitulo | null) | null = () => manifiesto(1),
) {
  const el = new AudioFalso()
  const leidas: string[] = []
  const motor = new MotorAudio({
    crearAudio: () => el as unknown as HTMLAudioElement,
    pedirEstado: jest.fn(async () => estados()),
    cargarTiempos: async () => TIEMPOS,
    ...(partes
      ? {
          cargarPartes: async (u: string) => {
            leidas.push(u)
            return partes()
          },
        }
      : {}),
    guardarServidor: async () => undefined,
    guardarLocal: async () => undefined,
    resolverUrl: (r) => r,
    dispositivo: () => 'PC',
    ahora: () => 1_000_000,
  })
  return { motor, el, leidas }
}

describe('v1.5: suena por partes mientras el capítulo se genera', () => {
  afterEach(() => jest.useRealTimers())

  it('empieza con la primera parte en el mismo <audio> y la línea de tiempo es la del capítulo', async () => {
    const { motor, el, leidas } = montar(() => conPartes)
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    expect(leidas).toEqual(['/a/cap-000.partes.json?t=x'])
    expect(el.src).toBe('/a/cap-000.parte-000.m4a?t=x')
    expect(motor.obtener().fase).toBe('reproduciendo')
    expect(motor.obtener().duracion).toBe(100) // la estimada mientras se genera
    el.emitir('loadedmetadata')
    el.currentTime = 4
    el.emitir('timeupdate')
    expect(motor.posicion()).toBe(4)
    expect(motor.obtener().fraseId).toBe('c000-s00000')
    motor.detener()
  })

  it('encadena la siguiente parte al acabar una; si aún no está, espera con el ▶ puesto y sigue sola', async () => {
    jest.useFakeTimers()
    let n = 1
    const { motor, el } = montar(
      () => conPartes,
      () => manifiesto(n),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    el.emitir('loadedmetadata')
    el.currentTime = 9
    el.acabar()
    expect(motor.obtener().fase).toBe('preparando')
    expect(motor.obtener().mensaje).toBe(TEXTOS_VOZ.continuacion)
    motor.reproducir() // ▶ mientras espera no vuelve a empezar la parte que acabó
    expect(el.paused).toBe(true)
    n = 2
    await jest.advanceTimersByTimeAsync(2600)
    expect(el.src).toBe('/a/cap-000.parte-001.m4a?t=x')
    expect(motor.obtener().fase).toBe('reproduciendo')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(0)
    el.currentTime = 5
    expect(motor.posicion()).toBe(15)
    motor.detener()
  })

  it('cuando el capítulo está LISTO pasa al archivo entero al acabar la parte, en la frase siguiente', async () => {
    jest.useFakeTimers()
    let entero = false
    const { motor, el } = montar(
      () => (entero ? listo : conPartes),
      () => manifiesto(2),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    el.emitir('loadedmetadata')
    entero = true
    await jest.advanceTimersByTimeAsync(2600)
    expect(el.src).toBe('/a/cap-000.parte-000.m4a?t=x') // no corta la parte que suena
    el.currentTime = 9
    el.acabar()
    expect(el.src).toBe('/a/cap-0.m4a')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(10)
    expect(motor.obtener().fase).toBe('reproduciendo')
    motor.detener()
  })

  it('en pausa, al estar LISTO cambia ya al archivo entero sin ponerse a sonar', async () => {
    jest.useFakeTimers()
    let entero = false
    const { motor, el } = montar(() => (entero ? listo : conPartes))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    el.emitir('loadedmetadata')
    el.currentTime = 3
    motor.pausar()
    entero = true
    await jest.advanceTimersByTimeAsync(2600)
    expect(el.src).toBe('/a/cap-0.m4a')
    expect(el.paused).toBe(true)
    expect(motor.posicion()).toBe(3)
    motor.detener()
  })

  it('al acabar la última parte de un capítulo completo pasa al siguiente capítulo', async () => {
    const { motor, el } = montar(
      () => conPartes,
      () => manifiesto(1, true),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    el.acabar()
    expect(motor.obtener().capitulo).toBe(1)
    motor.detener()
  })

  it('saltar dentro de lo generado cambia de parte; más allá, va a lo último que hay; a 3x acelera la parte', async () => {
    const { motor, el } = montar(
      () => conPartes,
      () => manifiesto(3),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    el.emitir('loadedmetadata')
    motor.buscar(35)
    expect(el.src).toBe('/a/cap-000.parte-002.m4a?t=x')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(5)
    motor.buscar(37)
    expect(el.currentTime).toBe(7)
    motor.buscar(95)
    expect(motor.posicion()).toBe(48)
    motor.setVelocidad(3)
    expect(el.src).toBe('/a/cap-000.parte-002.m4a?t=x')
    expect(el.playbackRate).toBe(3)
    el.emitir('loadedmetadata')
    el.currentTime = 18.5
    motor.fraseSiguiente() // tras la última frase generada no salta de capítulo
    expect(motor.obtener().capitulo).toBe(0)
    motor.detener()
  })

  it('un ERROR mientras suenan las partes se dice al llegar al final de lo generado', async () => {
    jest.useFakeTimers()
    let roto = false
    const { motor, el } = montar(() => (roto ? fallo : conPartes))
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    roto = true
    await jest.advanceTimersByTimeAsync(2600)
    expect(motor.obtener().fase).toBe('reproduciendo')
    el.acabar()
    expect(motor.obtener().fase).toBe('error')
    expect(motor.obtener().tipoError).toBe('capitulo')
    expect(motor.obtener().mensaje).toContain('El servicio de voz no respondió.')
    motor.detener()
  })

  it('si piden una frase que aún no se generó, sigue preparando hasta que llega', async () => {
    jest.useFakeTimers()
    let n = 1
    const { motor, el } = montar(
      () => conPartes,
      () => manifiesto(n),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1, fraseId: 'c000-s00002' })
    await jest.advanceTimersByTimeAsync(10)
    expect(motor.obtener().fase).toBe('preparando')
    n = 2
    await jest.advanceTimersByTimeAsync(1100)
    expect(el.src).toBe('/a/cap-000.parte-001.m4a?t=x')
    el.emitir('loadedmetadata')
    expect(el.currentTime).toBe(10)
    motor.detener()
  })

  it('una parte que ya no está (capítulo entero y limpiado) sigue en el archivo entero', async () => {
    jest.useFakeTimers()
    let entero = false
    const { motor, el } = montar(
      () => (entero ? listo : conPartes),
      () => manifiesto(2),
    )
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await jest.advanceTimersByTimeAsync(10)
    el.emitir('loadedmetadata')
    entero = true
    await jest.advanceTimersByTimeAsync(2600)
    el.currentTime = 3
    el.emitir('error')
    expect(el.src).toBe('/a/cap-0.m4a')
    expect(motor.obtener().fase).not.toBe('error')
    motor.detener()
  })

  it('cambiar de voz mientras suena: si las partes de la nueva ya llegan a la frase, cambia ya', async () => {
    const { motor, el } = montar(() => conPartes)
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    await esperar()
    el.emitir('loadedmetadata')
    el.currentTime = 2
    el.emitir('timeupdate')
    motor.setVoz('otra', 'Elvira')
    await esperar()
    await esperar()
    await esperar()
    expect(motor.obtener().vozId).toBe('otra')
    expect(motor.obtener().vozPendiente).toBeNull()
    motor.detener()
  })

  it('sin cargarPartes (versión anterior) espera al capítulo entero como siempre', async () => {
    const { motor } = montar(() => conPartes, null)
    motor.abrir(LIBRO, { capitulo: 0, vozId: 'v', velocidad: 1 })
    await esperar()
    expect(motor.obtener().fase).toBe('preparando')
    motor.detener()
  })
})
