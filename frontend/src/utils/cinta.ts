import { MP4BoxBuffer, createFile } from 'mp4box'

/*
 * LA CINTA: UN SOLO FLUJO DE AUDIO PARA TODO EL LIBRO (iPhone, 2026-11-12).
 *
 * Con la pantalla bloqueada, iOS suspende la página cuando un <audio> llega a su
 * fin, y un audio arrancado desde segundo plano puede sonar mudo (WebKit 173332
 * y 261554; Audiobookshelf #2655 sigue abierto por eso). Cambiar el `src` en
 * cada capítulo, que es lo que hacíamos, cae justo ahí.
 *
 * La salida probada (Legato, PR #427, PWA bloqueada en iOS 18.7) es no tener
 * nunca un «fin»: un ManagedMediaSource (iOS 17.1+) al que se le van añadiendo
 * los capítulos uno detrás de otro. El <audio> no cambia de `src` ni termina; el
 * paso de capítulo es solo contabilidad (en qué tramo de la cinta estamos).
 *
 * Los .m4a del taller no son MP4 fragmentado (MSE lo exige): se trocean aquí,
 * en el navegador, con mp4box (sin guardar una segunda copia en el disco). Se
 * mantiene poco por delante (~90 s) y se suelta lo ya oído: iOS deja poco sitio.
 *
 *   tiempo de la cinta = tramo.inicio + tiempo del archivo
 */

/** Un trozo de MP4 fragmentado (moof+mdat), con sus tiempos en el archivo (ya sin el retardo del codificador). */
export interface Trozo {
  t0: number
  t1: number
  datos: ArrayBuffer
}

export interface ArchivoTroceado {
  /** Segmento de inicialización (ftyp+moov con mvex). */
  init: ArrayBuffer
  trozos: Trozo[]
  /** Segundos del archivo (lo que dura al oírlo, sin el retardo del principio). */
  duracion: number
  /** Retardo del codificador AAC (muestras de cebado) que la lista de edición del .m4a esconde. */
  retardo: number
  /** Para addSourceBuffer: 'audio/mp4; codecs="mp4a.40.2"'. */
  tipo: string
}

/** Un archivo puesto en la cinta. */
export interface Tramo {
  /** La URL del archivo: dos tramos con la misma clave son el mismo audio. */
  clave: string
  inicio: number
  fin: number
  archivo: ArchivoTroceado
}

/** Muestras AAC por trozo (1024 por muestra; a 24 kHz, 256 ≈ 11 s ≈ 64 KB a 48 kbps). */
const MUESTRAS_POR_TROZO = 256
/** Cuánto se tiene añadido por delante de lo que suena. */
const POR_DELANTE = 90
/** Hueco entre tramos que se da por continuo (una trama AAC a 24 kHz son 43 ms). */
const HUECO = 0.15
/** Cuánto se guarda de lo ya oído (para un «−15 s» sin volver a añadir). */
const POR_DETRAS = 40

/** Trocea un .m4a (faststart) en MP4 fragmentado para MSE. */
export function trocear(datos: ArrayBuffer): Promise<ArchivoTroceado> {
  return new Promise((resolver, rechazar) => {
    const f = createFile()
    const crudos: { ultima: number; datos: ArrayBuffer }[] = []
    // En un objeto: TypeScript no ve lo que asignan los callbacks de mp4box.
    const leido: {
      info: { timescale: number; porMuestra: number; retardo: number; duracion: number; codec: string } | null
      init: ArrayBuffer | null
    } = { info: null, init: null }
    f.onError = (_m: string, msj: string) => rechazar(new Error(`mp4: ${msj}`))
    f.onReady = (movie) => {
      const t = movie.tracks.find((x) => x.type === 'audio' || x.audio) ?? movie.tracks[0]
      if (!t) return rechazar(new Error('mp4: sin pista de audio'))
      const porMuestra = t.nb_samples ? t.samples_duration / t.nb_samples : 1024
      // La lista de edición dice desde qué muestra se oye (el cebado del AAC) y cuánto dura de verdad.
      const ed = t.edits?.find((e) => e.media_time >= 0)
      const retardo = ed ? ed.media_time / t.timescale : 0
      const duracionEd = ed && t.movie_timescale ? ed.segment_duration / t.movie_timescale : 0
      const duracion = duracionEd > 0 ? duracionEd : t.samples_duration / t.timescale - retardo
      leido.info = { timescale: t.timescale, porMuestra, retardo, duracion, codec: t.codec }
      f.setSegmentOptions(t.id, null, { nbSamples: MUESTRAS_POR_TROZO })
      leido.init = f.initializeSegmentation().buffer
      f.start()
    }
    f.onSegment = (_id: number, _u: unknown, buffer: ArrayBuffer, siguiente: number) => {
      crudos.push({ ultima: siguiente, datos: buffer })
    }
    try {
      f.appendBuffer(MP4BoxBuffer.fromArrayBuffer(datos, 0), true)
      f.flush()
    } catch (e) {
      return rechazar(e instanceof Error ? e : new Error(String(e)))
    }
    const { info: i, init } = leido
    if (!i || !init) return rechazar(new Error('mp4: no se pudo leer'))
    let previa = 0
    const trozos = crudos.map((c) => {
      const t0 = (previa * i.porMuestra) / i.timescale - i.retardo
      const t1 = (c.ultima * i.porMuestra) / i.timescale - i.retardo
      previa = c.ultima
      return { t0, t1, datos: c.datos }
    })
    resolver({
      init,
      trozos,
      duracion: i.duracion,
      retardo: i.retardo,
      tipo: `audio/mp4; codecs="${i.codec || 'mp4a.40.2'}"`,
    })
  })
}

type ConstructorMS = { new (): MediaSource; isTypeSupported(t: string): boolean }

function constructorMS(forzado: boolean): ConstructorMS | null {
  const g = globalThis as { ManagedMediaSource?: ConstructorMS; MediaSource?: ConstructorMS }
  return g.ManagedMediaSource ?? (forzado ? (g.MediaSource ?? null) : null)
}

/**
 * ¿Se usa la cinta? En el iPhone/iPad (donde hace falta) si hay ManagedMediaSource.
 * `localStorage['bah.cinta']` = '1' la fuerza (también con MediaSource, para probarla en Chrome) y '0' la apaga.
 */
export function cintaDisponible(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  let preferencia: string | null = null
  try {
    preferencia = window.localStorage?.getItem('bah.cinta') ?? null
  } catch {
    /* sin almacenamiento: lo de por defecto */
  }
  if (preferencia === '0') return false
  const forzado = preferencia === '1'
  const MS = constructorMS(forzado)
  if (!MS || !MS.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')) return false
  if (forzado) return true
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
  return ios
}

/** Espera a que el SourceBuffer termine lo que está haciendo. */
const libre = (sb: SourceBuffer) =>
  sb.updating
    ? new Promise<void>((r) => sb.addEventListener('updateend', () => r(), { once: true }))
    : Promise.resolve()

export class Cinta {
  private ms: MediaSource | null = null
  private sb: SourceBuffer | null = null
  private url: string | null = null
  private cola: Promise<unknown> = Promise.resolve()
  private tramos: Tramo[] = []
  /** El tramo cuyo init se añadió por última vez (al cambiar de tramo se vuelve a añadir el suyo). */
  private initDe: Tramo | null = null
  /** Archivos ya troceados (el actual y el siguiente), para no volver a bajarlos. */
  private cache = new Map<string, Promise<ArchivoTroceado>>()
  /** El tramo que suena (el «capítulo» para el motor). */
  actual: Tramo | null = null

  constructor(
    private el: HTMLAudioElement,
    private descargar: (url: string) => Promise<ArrayBuffer>,
    private forzado = false,
  ) {
    // Un salto a una zona aún sin datos, o quedarse sin ellos: se rellena ya (sin esperar al próximo timeupdate).
    el.addEventListener('seeking', () => this.bomba())
    el.addEventListener('waiting', () => this.bomba())
  }

  /** La duración del MediaSource cubre toda la cinta (si no, el navegador recorta los saltos a lo ya añadido). */
  private async alargar() {
    const ms = this.ms
    const sb = this.sb
    const ultimo = this.tramos[this.tramos.length - 1]
    if (!ms || !sb || !ultimo || ms.readyState !== 'open') return
    const fin = ultimo.fin + 0.2
    if (Number.isFinite(ms.duration) && Math.abs(ms.duration - fin) < 0.01) return
    await libre(sb)
    try {
      ms.duration = fin
    } catch (e) {
      console.warn('[cinta] duración', e)
    }
  }

  /** ¿El <audio> está enganchado a la cinta? */
  get puesta(): boolean {
    return !!this.url && this.el.src === this.url
  }

  /** El tramo que va después de `t`, si ya está en la cinta. */
  siguienteDe(t: Tramo | null): Tramo | null {
    if (!t) return null
    const i = this.tramos.indexOf(t)
    return i >= 0 ? (this.tramos[i + 1] ?? null) : null
  }

  /** Segundos del archivo actual que suenan ahora. */
  tiempo(): number {
    return this.actual ? Math.max(0, (this.el.currentTime || 0) - this.actual.inicio) : 0
  }

  private archivo(url: string): Promise<ArchivoTroceado> {
    let p = this.cache.get(url)
    if (!p) {
      p = this.descargar(url).then(trocear)
      p.catch(() => this.cache.delete(url))
      this.cache.set(url, p)
      // Solo se guardan los dos o tres últimos (el actual, el siguiente y el que se deja).
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value as string)
    }
    return p
  }

  /** Engancha el <audio> a un MediaSource nuevo (una sola vez por sesión, salvo que se suelte). */
  private async poner(tipo: string): Promise<SourceBuffer> {
    if (this.puesta && this.sb && this.ms?.readyState === 'open') return this.sb
    const MS = constructorMS(this.forzado)
    if (!MS) throw new Error('sin MediaSource')
    const ms = new MS()
    this.ms = ms
    this.sb = null
    this.initDe = null
    this.url = URL.createObjectURL(ms)
    // ManagedMediaSource exige no ofrecer AirPlay (o darle otra fuente); la voz se oye en el teléfono.
    ;(this.el as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true
    const abierto = new Promise<void>((r) => ms.addEventListener('sourceopen', () => r(), { once: true }))
    this.el.src = this.url
    await abierto
    const sb = ms.addSourceBuffer(tipo)
    sb.mode = 'segments'
    this.sb = sb
    return sb
  }

  /** Suelta la cinta (para volver al <audio> normal: las partes de un capítulo que aún se genera). */
  soltar() {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    this.ms = null
    this.sb = null
    this.tramos = []
    this.actual = null
    this.initDe = null
  }

  /** Serializa las operaciones sobre el SourceBuffer (MSE no admite dos a la vez). */
  private turno<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.cola.then(fn, fn)
    this.cola = p.catch(() => undefined)
    return p
  }

  /**
   * Empieza la cinta de cero con este archivo, en `tArchivo` segundos. Lo que
   * hubiera se borra (otro capítulo elegido a mano, otra voz, otra velocidad).
   */
  cargar(url: string, tArchivo: number): Promise<Tramo> {
    const archivo = this.archivo(url)
    return this.turno(async () => {
      const a = await archivo
      const sb = await this.poner(a.tipo)
      await libre(sb)
      if (sb.buffered.length) {
        sb.remove(0, Infinity)
        await libre(sb)
      }
      const t: Tramo = { clave: url, inicio: 0, fin: a.duracion, archivo: a }
      this.tramos = [t]
      this.actual = t
      this.initDe = null
      await this.alargar()
      await this.anadirDesde(t, tArchivo)
      try {
        this.el.currentTime = t.inicio + Math.min(Math.max(0, tArchivo), Math.max(0, a.duracion - 0.05))
      } catch {
        /* aún sin metadatos: la bomba lo recoloca */
      }
      return t
    })
  }

  /** Pone el siguiente archivo justo detrás del último tramo: al llegar ahí sonará sin corte. */
  encolar(url: string): Promise<Tramo | null> {
    const ultimo = this.tramos[this.tramos.length - 1]
    if (!ultimo) return Promise.resolve(null)
    if (this.siguienteDe(ultimo) === null && ultimo.clave === url) return Promise.resolve(null)
    const archivo = this.archivo(url)
    return this.turno(async () => {
      const a = await archivo
      const ult = this.tramos[this.tramos.length - 1]
      if (!ult || !this.puesta) return null
      const t: Tramo = { clave: url, inicio: ult.fin, fin: ult.fin + a.duracion, archivo: a }
      this.tramos.push(t)
      await this.alargar()
      // Si lo que suena ya está cerca del final, se añade ya el principio del siguiente.
      await this.bombear()
      return t
    })
  }

  /** Quita los tramos que van después del actual (otra velocidad u otra voz: se volverán a poner). */
  olvidarSiguientes() {
    if (!this.actual) return
    const i = this.tramos.indexOf(this.actual)
    this.tramos = this.tramos.slice(0, i + 1)
  }

  /** El motor pasa al tramo siguiente (ya sonando): solo contabilidad. */
  avanzar(): Tramo | null {
    const s = this.siguienteDe(this.actual)
    if (s) {
      this.actual = s
      // Lo de antes ya no hace falta en la lista (los datos ya oídos los suelta la bomba).
      this.tramos = this.tramos.slice(this.tramos.indexOf(s))
    }
    return s
  }

  /** Salta dentro del tramo actual. */
  irA(tArchivo: number) {
    const t = this.actual
    if (!t) return
    const destino = t.inicio + Math.min(Math.max(0, tArchivo), Math.max(0, t.fin - t.inicio - 0.05))
    this.turno(async () => {
      if (!this.estaEnBuffer(destino)) await this.anadirDesde(t, destino - t.inicio)
    }).finally(() => {
      try {
        this.el.currentTime = destino
      } catch {
        /* nada */
      }
    })
  }

  /** Llamar a menudo (timeupdate): mantiene ~90 s por delante y suelta lo ya oído. */
  bomba() {
    if (!this.puesta || !this.sb) return
    this.turno(() => this.bombear())
  }

  private estaEnBuffer(t: number): boolean {
    const b = this.sb?.buffered
    if (!b) return false
    for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.01 && t < b.end(i) - 0.05) return true
    return false
  }

  /** Fin de lo añadido de forma continua desde `t` (o `t` si ahí no hay nada). */
  private finContinuo(t: number): number {
    const b = this.sb?.buffered
    if (!b) return t
    let fin = t
    // Huecos de menos de una trama AAC entre dos capítulos cuentan como continuos (el navegador los salta).
    for (let i = 0; i < b.length; i++) if (b.start(i) <= fin + HUECO && b.end(i) > fin) fin = b.end(i)
    return fin
  }

  private async anadirDesde(t: Tramo, tArchivo: number) {
    const sb = this.sb
    if (!sb) return
    const hasta = t.inicio + tArchivo + POR_DELANTE
    for (const z of t.archivo.trozos) {
      if (z.t1 <= tArchivo - 0.05) continue
      if (t.inicio + z.t0 > hasta) break
      await this.anadirTrozo(t, z)
    }
  }

  private async anadirTrozo(t: Tramo, z: Trozo) {
    const sb = this.sb
    if (!sb) return
    await libre(sb)
    if (this.initDe !== t) {
      // Cada tramo lleva su init y su desplazamiento; la ventana recorta el cebado del principio y el relleno del final.
      sb.appendWindowStart = 0
      sb.appendWindowEnd = Infinity
      sb.timestampOffset = t.inicio - t.archivo.retardo
      sb.appendWindowStart = t.inicio
      // Un poco más allá del fin: el relleno final tapa la media trama que el siguiente pierde al recortar su cebado.
      sb.appendWindowEnd = t.fin + 0.1
      sb.appendBuffer(t.archivo.init)
      await libre(sb)
      this.initDe = t
    }
    sb.appendBuffer(z.datos)
    await libre(sb)
  }

  private async bombear() {
    const sb = this.sb
    if (!sb || !this.actual || !this.puesta) return
    const ahora = this.el.currentTime || 0
    // 1) Por delante: lo que falte hasta ~90 s, cruzando al tramo siguiente cuando toca.
    for (let n = 0; n < 40; n++) {
      const fin = this.finContinuo(ahora)
      if (fin >= ahora + POR_DELANTE) break
      const tramo = this.tramos.find((x) => fin >= x.inicio - HUECO && fin < x.fin - 0.05)
      if (!tramo) break // no hay más cinta (falta el capítulo siguiente o es el final)
      const z = tramo.archivo.trozos.find((x) => tramo.inicio + x.t1 > fin + 0.05)
      if (!z) break
      try {
        await this.anadirTrozo(tramo, z)
      } catch (e) {
        if ((e as { name?: string })?.name === 'QuotaExceededError') break
        throw e
      }
      if (this.finContinuo(ahora) <= fin + 0.01) break // no avanzó: no insistir
    }
    // 2) Por detrás: se suelta lo ya oído (iOS deja poco sitio).
    const b = sb.buffered
    if (b.length && b.start(0) < ahora - POR_DETRAS - 20) {
      await libre(sb)
      sb.remove(0, ahora - POR_DETRAS)
      await libre(sb)
    }
  }
}

/** La cinta del motor de la voz, o null si en este navegador no hace falta (o no se puede). */
export function crearCinta(el: HTMLAudioElement): Cinta | null {
  if (!cintaDisponible()) return null
  let forzado = false
  try {
    forzado = window.localStorage?.getItem('bah.cinta') === '1'
  } catch {
    /* nada */
  }
  const descargar = async (url: string) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`audio ${r.status}`)
    return r.arrayBuffer()
  }
  return new Cinta(el, descargar, forzado)
}
