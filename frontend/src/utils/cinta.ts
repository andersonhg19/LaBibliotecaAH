import { MP4BoxBuffer, createFile } from 'mp4box'

import { clasificarFallo, errorCancelada, errorDeRed } from '@utils/fallosCinta'

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
 *
 * 0.4.0 (auditoría 2-reproductor):
 *   · se trocea MIENTRAS baja (RP-07): con el moov al principio (faststart) suena
 *     en cuanto llega el primer trozo, no al bajar el capítulo entero;
 *   · cada carga tiene su «época»: soltar la cinta o cargar otra cosa cancela lo
 *     que estaba en vuelo, que ya no vuelve a enganchar el <audio> (RP-05);
 *   · olvidar los tramos siguientes también los quita del SourceBuffer (RP-06);
 *   · si el navegador cierra el MediaSource (iOS bajo presión) se avisa al motor
 *     para que la rehaga en la misma posición (RP-08).
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
  /** Crece mientras baja el archivo (RP-07). */
  trozos: Trozo[]
  /** Segundos del archivo (lo que dura al oírlo, sin el retardo del principio). */
  duracion: number
  /** Retardo del codificador AAC (muestras de cebado) que la lista de edición del .m4a esconde. */
  retardo: number
  /** Para addSourceBuffer: 'audio/mp4; codecs="mp4a.40.2"'. */
  tipo: string
  /** Ya llegó entero (todos sus trozos están en `trozos`). */
  completo: boolean
}

/** Un archivo puesto en la cinta. */
export interface Tramo {
  /** La URL del archivo: dos tramos con la misma clave son el mismo audio. */
  clave: string
  inicio: number
  fin: number
  archivo: ArchivoTroceado
}

/**
 * Lo que devuelve la descarga: el archivo entero o, mejor, un flujo que se trocea
 * mientras llega (con su tamaño, si se sabe, para contar el progreso).
 */
export type Descarga = ArrayBuffer | { flujo: { getReader(): LectorFlujo }; total: number | null }
interface LectorFlujo {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
}

/** Muestras AAC por trozo (1024 por muestra; a 24 kHz, 256 ≈ 11 s ≈ 64 KB a 48 kbps). */
const MUESTRAS_POR_TROZO = 256
/** Cuánto se tiene añadido por delante de lo que suena. */
const POR_DELANTE = 90
/** Hueco entre tramos que se da por continuo (una trama AAC a 24 kHz son 43 ms). */
const HUECO = 0.15
/** Cuánto se guarda de lo ya oído (para un «−15 s» sin volver a añadir). */
const POR_DETRAS = 40
/**
 * Una descarga que no recibe NADA en este tiempo se da por cortada (fallo de red:
 * el motor lo dice y reintenta). Sin esto, un servidor atascado dejaba la cinta
 * esperando para siempre, sin sonar ni avisar (V-NUEVO-4).
 */
export const SIN_DATOS_MS = 20_000

/**
 * Trocea un .m4a mientras llega: mp4box lee el moov en cuanto aparece (faststart:
 * al principio) y va soltando trozos según llegan las muestras.
 */
export class Troceador {
  private f = createFile()
  private offset = 0
  private previa = 0
  private info: { id: number; timescale: number; porMuestra: number; retardo: number } | null = null
  private fallo: Error | null = null
  /** El archivo, en cuanto se sabe lo que es (duración, init); sus trozos van llegando. */
  archivo: ArchivoTroceado | null = null
  /** Se llama cada vez que hay trozos nuevos (y al terminar). */
  alCrecer: (() => void) | null = null

  constructor() {
    const f = this.f
    f.onError = (_m: string, msj: string) => {
      this.fallo = new Error(`mp4: ${msj}`)
    }
    f.onReady = (movie) => {
      const t = movie.tracks.find((x) => x.type === 'audio' || x.audio) ?? movie.tracks[0]
      if (!t) {
        this.fallo = new Error('mp4: sin pista de audio')
        return
      }
      const porMuestra = t.nb_samples ? t.samples_duration / t.nb_samples : 1024
      // La lista de edición dice desde qué muestra se oye (el cebado del AAC) y cuánto dura de verdad.
      const ed = t.edits?.find((e) => e.media_time >= 0)
      const retardo = ed ? ed.media_time / t.timescale : 0
      const duracionEd = ed && t.movie_timescale ? ed.segment_duration / t.movie_timescale : 0
      const duracion = duracionEd > 0 ? duracionEd : t.samples_duration / t.timescale - retardo
      this.info = { id: t.id, timescale: t.timescale, porMuestra, retardo }
      f.setSegmentOptions(t.id, null, { nbSamples: MUESTRAS_POR_TROZO })
      const init = f.initializeSegmentation().buffer
      this.archivo = {
        init,
        trozos: [],
        duracion,
        retardo,
        tipo: `audio/mp4; codecs="${t.codec || 'mp4a.40.2'}"`,
        completo: false,
      }
      f.start()
    }
    f.onSegment = (_id: number, _u: unknown, buffer: ArrayBuffer, siguiente: number) => {
      const i = this.info
      const a = this.archivo
      if (!i || !a) return
      const t0 = (this.previa * i.porMuestra) / i.timescale - i.retardo
      const t1 = (siguiente * i.porMuestra) / i.timescale - i.retardo
      this.previa = siguiente
      a.trozos.push({ t0, t1, datos: buffer })
      // mp4box guarda las muestras leídas: ya van en el trozo, se sueltan (no tener el capítulo dos veces en memoria).
      ;(f as { releaseUsedSamples?: (id: number, n: number) => void }).releaseUsedSamples?.(i.id, siguiente)
    }
  }

  private revisar() {
    if (this.fallo) throw this.fallo
  }

  /** Añade lo que acaba de llegar (en orden). */
  anadir(datos: ArrayBuffer, ultimo = false) {
    const antes = this.archivo?.trozos.length ?? -1
    const b = MP4BoxBuffer.fromArrayBuffer(datos, this.offset)
    this.offset += datos.byteLength
    this.f.appendBuffer(b, ultimo)
    this.revisar()
    if ((this.archivo?.trozos.length ?? -1) !== antes) this.alCrecer?.()
  }

  /** Ya llegó todo: suelta lo que quede. */
  terminar(): ArchivoTroceado {
    this.f.flush()
    this.revisar()
    const a = this.archivo
    if (!a) throw new Error('mp4: no se pudo leer')
    a.completo = true
    this.alCrecer?.()
    return a
  }
}

/** Trocea un .m4a (faststart) entero en MP4 fragmentado para MSE. */
export function trocear(datos: ArrayBuffer): Promise<ArchivoTroceado> {
  try {
    const t = new Troceador()
    t.anadir(datos, true)
    return Promise.resolve(t.terminar())
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)))
  }
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

/** ¿Un fetch o una lectura abortados con AbortController? */
const esAbortada = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError'

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
  /** Archivos ya troceados (o troceándose), para no volver a bajarlos. */
  private cache = new Map<string, Promise<ArchivoTroceado>>()
  /** Sube con cada carga y al soltar: lo que estaba en vuelo de antes ya no toca el <audio> (RP-05). */
  private epoca = 0
  /** Sube al cargar, al olvidar los siguientes y al soltar: un encolar en vuelo de antes no se añade (RP-06). */
  private epocaCola = 0
  /** Mientras se espera el sourceopen: soltar la cinta lo desbloquea (si no, la cola se quedaría parada). */
  private abriendo: (() => void) | null = null
  /** Descargas en vuelo, con cómo cortarlas (V-NUEVO-4: la de un capítulo abandonado no bloquea la cola). */
  private enVuelo = new Map<string, (e: Error) => void>()
  /** El tramo que suena (el «capítulo» para el motor). */
  actual: Tramo | null = null
  /** El navegador cerró el MediaSource por su cuenta (iOS bajo presión de memoria, RP-08). */
  alCerrarse: (() => void) | null = null
  /** Una descarga que ya sonaba se cortó a medias (el motor decide si reintenta). */
  alFallarDescarga: ((url: string, e: unknown) => void) | null = null
  /** Cuánto ha bajado de un archivo (0–1), para el anillo del ▶ (F6). */
  alProgresar: ((url: string, fraccion: number) => void) | null = null

  constructor(
    private el: HTMLAudioElement,
    private descargar: (url: string, senal?: AbortSignal) => Promise<Descarga>,
    private forzado = false,
    private sinDatosMs = SIN_DATOS_MS,
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
      p = this.bajar(url)
      p.catch(() => this.cache.delete(url))
      this.cache.set(url, p)
      // Solo se guardan los dos o tres últimos (el actual, el siguiente y el que se deja).
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value as string)
    }
    return p
  }

  /**
   * Baja y trocea un archivo. La promesa se cumple en cuanto hay algo que sonar
   * (el moov y el primer trozo); el resto sigue llegando y se va añadiendo.
   *
   * V-NUEVO-4: la descarga se puede cortar (otra carga la deja sin sentido: se
   * rechaza como CANCELADA y se aborta el fetch) y se corta sola si pasa
   * SIN_DATOS_MS sin recibir nada (fallo de red: el motor avisa y reintenta).
   */
  private bajar(url: string): Promise<ArchivoTroceado> {
    return new Promise<ArchivoTroceado>((resolver, rechazar) => {
      const tr = new Troceador()
      const control = typeof AbortController === 'function' ? new AbortController() : null
      let listo = false
      let cortadaCon: Error | null = null
      let avisarCorte: (e: Error) => void = () => {}
      const corte = new Promise<never>((_, r) => {
        avisarCorte = r
      })
      corte.catch(() => undefined)
      let vigia: ReturnType<typeof setTimeout> | null = null
      const cortar = (e: Error) => {
        if (cortadaCon) return
        cortadaCon = e
        avisarCorte(e)
        try {
          control?.abort()
        } catch {
          /* nada */
        }
      }
      const vigilar = () => {
        if (vigia) clearTimeout(vigia)
        vigia = setTimeout(
          () => cortar(errorDeRed(`sin datos en ${Math.round(this.sinDatosMs / 1000)} s`)),
          this.sinDatosMs,
        )
      }
      this.enVuelo.set(url, cortar)
      const avisar = () => {
        const a = tr.archivo
        if (!a) return
        if (!listo && (a.trozos.length > 0 || a.completo)) {
          listo = true
          resolver(a)
        } else if (listo) this.bomba() // trozos nuevos: se siguen añadiendo
      }
      tr.alCrecer = avisar
      const leer = async () => {
        vigilar()
        const d = await Promise.race([this.descargar(url, control?.signal), corte])
        if (!('flujo' in d)) {
          this.alProgresar?.(url, 1)
          tr.anadir(d, true)
          tr.terminar()
          return
        }
        const lector = d.flujo.getReader()
        let recibido = 0
        for (;;) {
          vigilar()
          let r: { done: boolean; value?: Uint8Array }
          try {
            r = await Promise.race([lector.read(), corte])
          } catch (e) {
            throw cortadaCon ?? (esAbortada(e) ? errorCancelada() : errorDeRed(e))
          }
          if (r.done) break
          const v = r.value
          if (!v?.byteLength) continue
          recibido += v.byteLength
          if (d.total) this.alProgresar?.(url, Math.min(1, recibido / d.total))
          // Una copia propia: mp4box guarda el búfer y el del lector puede reutilizarse.
          tr.anadir(v.slice().buffer as ArrayBuffer)
        }
        this.alProgresar?.(url, 1)
        tr.terminar()
      }
      leer()
        .catch((e0: unknown) => {
          const e = cortadaCon ?? e0
          if (!listo) return rechazar(e)
          // Ya sonaba y la descarga se cortó a medias: lo que falta no llegará; se olvida para volver a bajarlo.
          this.cache.delete(url)
          if (clasificarFallo(e) !== 'cancelada') this.alFallarDescarga?.(url, e)
        })
        .finally(() => {
          if (vigia) clearTimeout(vigia)
          if (this.enVuelo.get(url) === cortar) this.enVuelo.delete(url)
        })
    })
  }

  /** Corta las descargas en vuelo que ya no hacen falta (otro capítulo elegido mientras bajaba el anterior). */
  private cancelarDescargasMenos(url: string) {
    for (const [u, cortar] of [...this.enVuelo]) {
      if (u === url) continue
      this.enVuelo.delete(u)
      this.cache.delete(u)
      cortar(errorCancelada())
    }
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
    const abierto = new Promise<void>((r) => {
      this.abriendo = r
      ms.addEventListener('sourceopen', () => r(), { once: true })
    })
    this.el.src = this.url
    await abierto
    this.abriendo = null
    if (this.ms !== ms) throw errorCancelada()
    // iOS puede cerrar la cinta por su cuenta (memoria, suspensión larga): el motor la rehace (RP-08).
    ms.addEventListener('sourceclose', () => {
      if (this.ms === ms) this.cerrada()
    })
    // ManagedMediaSource pide datos cuando le conviene (startstreaming) y deja de pedirlos (endstreaming).
    ms.addEventListener('startstreaming', () => this.bomba())
    const sb = ms.addSourceBuffer(tipo)
    sb.mode = 'segments'
    this.sb = sb
    return sb
  }

  /** El MediaSource se cerró sin pedirlo: se suelta y se avisa. */
  private cerrada() {
    console.warn('[cinta] el navegador cerró la cinta; se rehace')
    this.soltar()
    this.alCerrarse?.()
  }

  /** Suelta la cinta (para volver al <audio> normal: las partes de un capítulo que aún se genera). */
  soltar() {
    this.epoca++
    this.epocaCola++
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    this.ms = null
    this.sb = null
    this.tramos = []
    this.actual = null
    this.initDe = null
    const r = this.abriendo
    this.abriendo = null
    r?.()
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
   * Si mientras tanto se suelta la cinta o se carga otra cosa, se rechaza con
   * CANCELADA sin tocar el <audio>.
   */
  cargar(url: string, tArchivo: number): Promise<Tramo> {
    const epoca = ++this.epoca
    this.epocaCola++
    // Lo que se bajaba para otra cosa ya no va: no debe tener la cola esperando (V-NUEVO-4).
    this.cancelarDescargasMenos(url)
    const archivo = this.archivo(url)
    return this.turno(async () => {
      const vigente = () => {
        if (epoca !== this.epoca) throw errorCancelada()
      }
      let a: ArchivoTroceado
      try {
        a = await archivo
      } catch (e) {
        vigente()
        throw e
      }
      vigente()
      const sb = await this.poner(a.tipo)
      vigente()
      await libre(sb)
      if (sb.buffered.length) {
        sb.remove(0, Infinity)
        await libre(sb)
      }
      vigente()
      const t: Tramo = { clave: url, inicio: 0, fin: a.duracion, archivo: a }
      this.tramos = [t]
      this.actual = t
      this.initDe = null
      await this.alargar()
      await this.anadirDesde(t, tArchivo)
      vigente()
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
    const cola = this.epocaCola
    const archivo = this.archivo(url)
    return this.turno(async () => {
      let a: ArchivoTroceado
      try {
        a = await archivo
      } catch (e) {
        if (cola !== this.epocaCola) return null
        throw e
      }
      // Entre tanto se olvidó lo de detrás o se cargó otra cosa: esto ya no va (otra voz, otra velocidad).
      if (cola !== this.epocaCola) return null
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

  /**
   * Quita los tramos que van después del actual (otra velocidad u otra voz: se
   * volverán a poner), también lo ya añadido al SourceBuffer (RP-06): si no, el
   * capítulo siguiente sonaría con la voz o la velocidad de antes.
   */
  olvidarSiguientes() {
    this.epocaCola++
    const t = this.actual
    if (!t) return
    const i = this.tramos.indexOf(t)
    this.tramos = this.tramos.slice(0, i + 1)
    this.turno(async () => {
      const sb = this.sb
      if (!sb || !this.puesta || this.actual !== t) return
      await libre(sb)
      const b = sb.buffered
      if (b.length && b.end(b.length - 1) > t.fin + 0.01) {
        sb.remove(t.fin, Infinity)
        await libre(sb)
      }
    }).catch((e) => console.warn('[cinta] olvidar', e))
  }

  /** El motor pasa al tramo siguiente (ya sonando): solo contabilidad. */
  avanzar(): Tramo | null {
    const viejo = this.actual
    const s = this.siguienteDe(viejo)
    if (s) {
      this.actual = s
      // Lo de antes ya no hace falta en la lista (los datos ya oídos los suelta la bomba) ni en la caché.
      this.tramos = this.tramos.slice(this.tramos.indexOf(s))
      if (viejo && viejo.clave !== s.clave) this.cache.delete(viejo.clave)
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
    })
      .catch((e) => this.alFallarBomba(e))
      .finally(() => {
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
    this.turno(() => this.bombear()).catch((e) => this.alFallarBomba(e))
  }

  /** Un fallo al añadir (RP-08): si el MediaSource ya no está abierto, la cinta se rehace. */
  private alFallarBomba(e: unknown) {
    const ms = this.ms
    if (ms && ms.readyState !== 'open') return this.cerrada()
    console.warn('[cinta] no se pudo añadir', e)
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
      // Pero si el siguiente ya está añadido, no se pisa su principio (RP-11).
      const yaSigue = !!this.siguienteDe(t) && this.estaEnBuffer(t.fin + 0.02)
      sb.appendWindowEnd = yaSigue ? t.fin : t.fin + 0.1
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
    // ManagedMediaSource: con «streaming» en false el navegador no quiere más datos ahora (los pedirá).
    const pide = (this.ms as (MediaSource & { streaming?: boolean }) | null)?.streaming !== false
    // 1) Por delante: lo que falte hasta ~90 s, cruzando al tramo siguiente cuando toca.
    for (let n = 0; pide && n < 40; n++) {
      const fin = this.finContinuo(ahora)
      if (fin >= ahora + POR_DELANTE) break
      const tramo = this.tramos.find((x) => fin >= x.inicio - HUECO && fin < x.fin - 0.05)
      if (!tramo) break // no hay más cinta (falta el capítulo siguiente o es el final)
      const z = tramo.archivo.trozos.find((x) => tramo.inicio + x.t1 > fin + 0.05)
      if (!z) break // aún no ha bajado (se sigue al llegar)
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
  const descargar = async (url: string, senal?: AbortSignal): Promise<Descarga> => {
    let r: Response
    try {
      r = await fetch(url, senal ? { signal: senal } : undefined)
    } catch (e) {
      // Cortada a propósito (otra carga): no es un fallo.
      if (esAbortada(e)) throw errorCancelada()
      // Sin red (o la red se cortó): no es culpa de la cinta, se reintentará.
      throw errorDeRed(e)
    }
    if (!r.ok) throw new Error(`audio ${r.status}`)
    const largo = Number(r.headers.get('content-length'))
    if (r.body && typeof r.body.getReader === 'function')
      return { flujo: r.body, total: Number.isFinite(largo) && largo > 0 ? largo : null }
    return r.arrayBuffer()
  }
  return new Cinta(el, descargar, forzado)
}
