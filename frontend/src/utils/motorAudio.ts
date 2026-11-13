import { buscarFrase, buscarPalabra, capituloDeFrase, indiceDeFrase, inicioFraseSiguiente } from '@logica/tiempos'
import { normalizarVelocidad, planDeVelocidad, resaltaPalabra, tiempoEn1x, tiempoEnArchivo } from '@logica/velocidad'
import type { CapituloResumen, EstadoAudioDTO, PartesCapitulo, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

/*
 * EL MOTOR DE LA VOZ (plan §6.3 y §6.4).
 *
 * UN SOLO <audio> PARA TODA LA SESIÓN. iOS solo deja seguir sonando con la
 * pantalla bloqueada al elemento que el usuario activó con un toque; si al
 * cambiar de capítulo se creara otro, el iPhone se callaría en el capítulo 2.
 * Por eso el elemento se crea una vez, se "desbloquea" en el primer toque y
 * después solo se le cambia el `src`.
 *
 * Línea de tiempo: todo se piensa en segundos del capítulo a 1x (la de
 * tiempos.json). Si suena el archivo 2x, currentTime = pos1x / 2.
 *
 * LOS FALLOS NO DEJAN LA VOZ MUERTA (QA LV-02). Se recuerda qué capítulo se
 * quería oír y si se quería oír sonando (`quiereSonar`):
 *   · sin red  → se reintenta solo (con espera creciente y al volver la red),
 *                y ▶ (también el de la pantalla de bloqueo) reintenta ya;
 *   · capítulo en ERROR (contrato v1.2) → se dice el porqué y solo se vuelve
 *                a pedir con un gesto: «Reintentar» o ▶ (petición explícita);
 *   · el archivo no carga → ▶ vuelve a pedirlo desde donde iba.
 * «Capítulo siguiente» con el capítulo sin oír por falta de red lo reintenta en
 * vez de saltárselo.
 *
 * CAMBIAR DE VOZ NO CALLA (QA LV-07): si suena, la voz actual sigue hasta que
 * la nueva está lista (entera o, v1.5, con partes hasta la frase que suena);
 * entonces se cambia en la misma frase.
 *
 * SUENA ANTES DE ESTAR ENTERO (v1.5, contratos §6 bis). Mientras el taller
 * genera un capítulo va dejando PARTES reproducibles (la primera, de 3 frases,
 * a los pocos segundos) y un manifiesto con sus tiempos. El motor las encadena
 * en el MISMO <audio> (al acabar una parte se le cambia el `src`, como entre
 * capítulos: la pantalla bloqueada del iPhone lo permite) y, cuando el capítulo
 * entero está LISTO, pasa al archivo completo al terminar la parte en curso (o
 * ya, si está en pausa o el usuario salta). La línea de tiempo es siempre la
 * del capítulo: posición = t0 de la parte + currentTime.
 */

type AudioExtendido = HTMLAudioElement & {
  playsInline?: boolean
  preservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

/** La Media Session del navegador, si existe (Safari iOS 15+, Chrome Android). */
const sesion = (): MediaSession | undefined =>
  typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : undefined

export type Fase = 'inactivo' | 'preparando' | 'cargando' | 'reproduciendo' | 'pausado' | 'error'

/** Por qué está en error: decide si se reintenta solo, con un gesto o nunca. */
export type TipoError = 'red' | 'capitulo' | 'audio' | 'servidor' | 'conversion'

export interface LibroEnVoz {
  ejemplarId: string
  titulo: string
  autores: string[]
  portadaUrl: string | null
  capitulos: CapituloResumen[]
}

export type Temporizador = { tipo: 'minutos'; minutos: number; finEn: number } | { tipo: 'capitulo' } | null

/** Una espera del taller: desde cuándo y cuánto se calcula que tardará. */
export interface Espera {
  desde: number
  estimadoSeg: number
}

export interface EstadoVoz {
  libro: LibroEnVoz | null
  capitulo: number
  vozId: string
  nombreVoz: string
  velocidad: number
  fase: Fase
  mensaje: string | null
  posicion: number
  duracion: number
  fraseId: string | null
  temporizador: Temporizador
  /** En fase 'error': de qué tipo (y por tanto si tiene sentido «Reintentar»). */
  tipoError: TipoError | null
  /** En fase 'preparando': la espera del capítulo, para «Preparando… (≈ 20 s)». */
  preparacion: Espera | null
  /** Una voz nueva que se prepara mientras sigue sonando la actual. */
  vozPendiente: ({ id: string; nombre: string } & Espera) | null
}

export interface EventoFrase {
  ejemplarId: string
  fraseId: string | null
  /** [inicioChar, finChar] de la palabra que suena dentro de la frase, o null. */
  palabra: [number, number] | null
}

export interface DependenciasMotor {
  crearAudio: () => HTMLAudioElement | null
  pedirEstado: (
    d: { ejemplarId: string; vozId: string; capitulo: number },
    o?: { reintentar?: boolean },
  ) => Promise<ResultDTO<EstadoAudioDTO>>
  cargarTiempos: (url: string) => Promise<TiemposCapitulo | null>
  guardarServidor: (p: ProgresoDTO) => Promise<unknown>
  guardarLocal: (p: ProgresoDTO) => Promise<unknown>
  resolverUrl: (ruta: string | null) => string | null
  dispositivo: () => string
  ahora: () => number
  /** Avisa cuando vuelve la red (window 'online'); devuelve cómo dejar de escuchar. */
  alVolverLaRed?: (fn: () => void) => () => void
  /** v1.5: lee cap-NNN.partes.json. Sin ella, se espera al capítulo entero como antes. */
  cargarPartes?: (url: string) => Promise<PartesCapitulo | null>
}

/** Silencio WAV de 0,1 s: lo que suena en el primer toque para "desbloquear" el <audio> en iOS. */
export const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/*
 * Textos propios de la voz. Viven aquí y no en utils/mensajes.ts para no tocar
 * archivos compartidos: el integrador puede moverlos cuando quiera.
 */
export const TEXTOS_VOZ = {
  sinRedReintentando: 'Sin conexión con la biblioteca. Se reintentará sola; o toca ▶ para probar ya.',
  capituloFallo: 'La voz de este capítulo no se pudo generar.',
  audioFallo: 'No se pudo cargar el audio de este capítulo. Toca ▶ o «Reintentar».',
  vozNueva: (nueva: string, actual: string) => `Sigue sonando ${actual} mientras se prepara la voz de ${nueva}`,
  vozNuevaNoLista: (nueva: string, actual: string) => `La voz de ${nueva} no se pudo preparar; sigue ${actual}.`,
  tardaMas: 'tarda más de lo normal: puede haber otros libros en la cola',
  continuacion: 'Preparando la continuación…',
}

const SALTO_SEG = 15
const PAUSA_LARGA_MS = 5 * 60 * 1000
const FUNDIDO_MS = 10_000
const CADA_LOCAL_MS = 5_000
const CADA_SERVIDOR_MS = 15_000
const SONDEO_MS = 3_000
/** Al principio de una espera se pregunta más a menudo: la primera parte suele estar en 2–4 s (v1.5). */
const SONDEO_RAPIDO_MS = 700
const RAPIDO_DURANTE_MS = 60_000
/** Mientras suena por partes, cada cuánto se mira si hay más partes o si el capítulo ya está entero. */
const SONDEO_PARTES_MS = 2_500
/** Esperas entre reintentos automáticos sin red (después se queda en la última). */
const REINTENTOS_MS = [2_000, 4_000, 8_000, 15_000, 30_000]
/** Escuchando de corrido, cuántos capítulos en ERROR seguidos se saltan antes de parar y decirlo. */
const MAX_SALTOS = 3

/**
 * Cuánto tarda el taller en generar un capítulo (medido en QA: un capítulo de
 * ~3 min de voz, ~20 s con la cola vacía). Si el servidor da su estimación, se
 * usa la suya.
 */
export function estimarPreparacion(minutosCapitulo: number | null | undefined, delServidor?: number | null): number {
  if (delServidor != null && Number.isFinite(delServidor) && delServidor > 0) return Math.round(delServidor)
  const m = Math.max(0, minutosCapitulo ?? 0)
  return Math.round(10 + m * 4)
}

/** «≈ 20 s», «≈ 2 min» o null cuando ya pasó la estimación. */
export function faltaParaEstar(espera: Espera, ahora: number): string | null {
  const falta = espera.estimadoSeg - (ahora - espera.desde) / 1000
  if (falta <= 0) return null
  if (falta < 60) return `≈ ${Math.max(5, Math.ceil(falta / 5) * 5)} s`
  return `≈ ${Math.ceil(falta / 60)} min`
}

/** «Preparando la voz de Álvaro… (≈ 20 s)» o «…: tarda más de lo normal…». */
export function textoEspera(base: string, espera: Espera | null, ahora: number): string {
  if (!espera) return base
  const f = faltaParaEstar(espera, ahora)
  const limpio = base.replace(/…$/, '')
  return f ? `${limpio}… (${f})` : `${limpio}… ${TEXTOS_VOZ.tardaMas}.`
}

/** Lo que acepta /progreso/save (contrato v1.2) para la velocidad. */
export const VELOCIDAD_PROGRESO = { min: 0.25, max: 5 }

/** Un número finito dentro de [min, max] (si no es finito, el valor por defecto). */
export function acotar(n: number, min: number, max: number, siNo: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : siNo
}

const inicial: EstadoVoz = {
  libro: null,
  capitulo: 0,
  vozId: 'edge.es-ES-AlvaroNeural',
  nombreVoz: 'Álvaro',
  velocidad: 1,
  fase: 'inactivo',
  mensaje: null,
  posicion: 0,
  duracion: 0,
  fraseId: null,
  temporizador: null,
  tipoError: null,
  preparacion: null,
  vozPendiente: null,
}

export class MotorAudio {
  private el: HTMLAudioElement | null = null
  private desbloqueado = false
  private estado: EstadoVoz = inicial
  private oyentes = new Set<() => void>()
  private oyentesFrase = new Set<(e: EventoFrase) => void>()
  private urls: { u1: string | null; u2: string | null } = { u1: null, u2: null }
  private tiempos: TiemposCapitulo | null = null
  private factor: 1 | 2 = 1
  private rate = 1
  private turno = 0
  private turnoVoz = 0
  private sondeo: ReturnType<typeof setTimeout> | null = null
  private sondeoVoz: ReturnType<typeof setTimeout> | null = null
  private reintento: ReturnType<typeof setTimeout> | null = null
  private intentosRed = 0
  private ultimaPausa = 0
  private ultimoLocal = 0
  private ultimoServidor = 0
  private ultimaPosSesion = 0
  private palabraActual: [number, number] | null = null
  private raf: number | null = null
  private fraseObjetivo: string | null = null
  private posPendiente: number | null = null
  /** Lo que el usuario quiere: que suene (▶) o no (⏸). Sobrevive a cargas y fallos. */
  private quiereSonar = false
  /** El capítulo que se pidió cargar por última vez, para reintentarlo igual. */
  private pedido: { capitulo: number; posicion: number; fraseId: string | null } | null = null
  /** v1.5: el manifiesto de partes del capítulo que se genera (URL absoluta con token) y la parte que suena. */
  private partes: { url: string; m: PartesCapitulo } | null = null
  private parteActual = -1
  /** Se acabó la última parte escrita y la siguiente aún no está: se espera sin soltar el ▶. */
  private esperandoParte = false
  /** El capítulo falló (ERROR) mientras sonaban sus partes: se dice al llegar al final de lo que hay. */
  private errorEnPartes: string | null = null
  /** Pregunta ya al servidor (sin esperar al siguiente sondeo). */
  private sondearYa: (() => void) | null = null
  /** Capítulos en ERROR saltados seguidos al pasar solo al siguiente (tope para no recorrer el libro entero). */
  private saltosSeguidos = 0

  constructor(private deps: DependenciasMotor) {
    deps.alVolverLaRed?.(() => {
      if (this.estado.fase === 'error' && this.estado.tipoError === 'red') this.reintentar()
    })
  }

  // ------------------------------------------------------------ suscripción
  obtener = () => this.estado
  suscribir = (fn: () => void) => {
    this.oyentes.add(fn)
    return () => {
      this.oyentes.delete(fn)
    }
  }
  suscribirFrase = (fn: (e: EventoFrase) => void) => {
    this.oyentesFrase.add(fn)
    this.arrancarRaf()
    return () => {
      this.oyentesFrase.delete(fn)
    }
  }
  private poner(p: Partial<EstadoVoz>) {
    this.estado = { ...this.estado, ...p }
    this.oyentes.forEach((f) => f())
  }
  private emitirFrase() {
    const l = this.estado.libro
    if (!l) return
    const ev = { ejemplarId: l.ejemplarId, fraseId: this.estado.fraseId, palabra: this.palabraActual }
    this.oyentesFrase.forEach((f) => f(ev))
  }
  private fallar(tipo: TipoError, mensaje: string) {
    this.esperandoParte = false
    this.poner({ fase: 'error', tipoError: tipo, mensaje, preparacion: null })
  }

  /**
   * El capítulo con voz que va después (o antes) de `desde`, o -1. Una página sin ninguna palabra (minutos 0:
   * una imagen, una portadilla vacía) no se oye: se pasa de largo (2026-11-12, «Sección 4» paraba la escucha).
   */
  private vecinoConVoz(desde: number, paso: 1 | -1): number {
    const caps = this.estado.libro?.capitulos ?? []
    for (let i = desde + paso; i >= 0 && i < caps.length; i += paso) if (caps[i].minutos !== 0) return i
    return -1
  }

  /** Hay algo que sonar: el capítulo entero o, mientras se genera, sus partes. */
  private hayAudio(): boolean {
    return !!this.urls.u1 || this.parteActual >= 0
  }

  /** Suena (o está cargada) una parte, no el archivo entero. */
  private enPartes(): boolean {
    return this.parteActual >= 0 && !!this.partes
  }

  private olvidarPartes() {
    this.partes = null
    this.parteActual = -1
    this.esperandoParte = false
    this.errorEnPartes = null
  }

  /** El tiempo de la frase pedida en el capítulo cargado (para "escuchar desde aquí"). */
  inicioDeFrase(fraseId: string): number | null {
    if (!this.tiempos) return null
    const i = indiceDeFrase(this.tiempos.frases, fraseId)
    return i >= 0 ? this.tiempos.frases[i].t0 : null
  }

  // ------------------------------------------------------------ el elemento
  private audio(): HTMLAudioElement | null {
    if (this.el) return this.el
    const el = this.deps.crearAudio()
    if (!el) return null
    el.preload = 'auto'
    const ext = el as AudioExtendido
    ext.playsInline = true
    el.setAttribute?.('playsinline', '')
    ext.preservesPitch = true
    ext.webkitPreservesPitch = true
    el.addEventListener('timeupdate', this.alAvanzar)
    el.addEventListener('ended', this.alTerminar)
    el.addEventListener('play', () => {
      // El silencio de desbloqueo no es "sonar": no debe tapar el «Preparando…».
      if (!this.estado.libro || el.src === SILENCIO) return
      this.poner({ fase: 'reproduciendo', mensaje: null, tipoError: null, preparacion: null })
      this.arrancarRaf()
      this.sesionMedios()
    })
    el.addEventListener('pause', () => {
      if (el.src === SILENCIO) return
      if (this.estado.fase === 'reproduciendo') this.poner({ fase: 'pausado' })
      this.ultimaPausa = this.deps.ahora()
      this.guardar(true)
      this.estadoSesion('paused')
    })
    el.addEventListener('loadedmetadata', this.alCargarMetadatos)
    el.addEventListener('error', () => {
      if (el.src && el.src !== SILENCIO && this.estado.libro && this.hayAudio()) {
        // Una parte que ya no está (el capítulo se terminó y se limpió): se sigue en el archivo entero.
        if (this.enPartes() && this.urls.u1) return this.aCompleto(this.posicion(), this.quiereSonar)
        this.fallar('audio', TEXTOS_VOZ.audioFallo)
      }
    })
    this.el = el
    return el
  }

  /**
   * Llamar DENTRO del gesto del usuario (el toque en "Escuchar"): reproduce un
   * silencio para que iOS dé por activado el elemento. A partir de ahí, los
   * play() que lleguen después de esperar al servidor ya no se bloquean.
   */
  desbloquear() {
    const el = this.audio()
    if (!el || this.desbloqueado) return
    this.desbloqueado = true
    try {
      if (!el.src || el.src === SILENCIO) {
        el.src = SILENCIO
        const p = el.play()
        if (p && typeof p.then === 'function') p.then(() => el.pause()).catch(() => {})
      }
    } catch {
      /* algunos navegadores no lo necesitan */
    }
  }

  // ------------------------------------------------------------ abrir y cargar
  /** Empieza (o retoma) un libro. Llamar desde el toque del usuario. */
  abrir(
    libro: LibroEnVoz,
    o: {
      capitulo: number
      posicion?: number
      fraseId?: string | null
      vozId: string
      nombreVoz?: string
      velocidad: number
      reproducir?: boolean
    },
  ) {
    this.desbloquear()
    const mismo =
      this.estado.libro?.ejemplarId === libro.ejemplarId &&
      this.estado.capitulo === o.capitulo &&
      this.estado.vozId === o.vozId &&
      this.urls.u1 &&
      this.estado.fase !== 'error'
    this.cancelarVozPendiente()
    this.poner({
      libro,
      vozId: o.vozId,
      nombreVoz: o.nombreVoz ?? this.estado.nombreVoz,
      velocidad: normalizarVelocidad(o.velocidad),
      vozPendiente: null,
    })
    const reproducir = o.reproducir ?? true
    if (mismo) {
      if (o.fraseId) this.irAFrase(o.fraseId, reproducir)
      else if (o.posicion != null) this.buscar(o.posicion)
      if (reproducir) this.reproducir()
      return
    }
    this.cargar(o.capitulo, o.posicion ?? 0, reproducir, o.fraseId ?? null)
  }

  private cancelarSondeo() {
    if (this.sondeo) clearTimeout(this.sondeo)
    this.sondeo = null
    if (this.reintento) clearTimeout(this.reintento)
    this.reintento = null
  }

  private async cargar(
    capitulo: number,
    posicion: number,
    reproducir: boolean,
    fraseId: string | null = null,
    reintentar = false,
    /** Se llegó solo, al acabar el anterior: un capítulo en ERROR se salta en vez de parar la escucha. */
    automatico = false,
  ) {
    const l = this.estado.libro
    if (!l) return
    const turno = ++this.turno
    this.cancelarSondeo()
    this.quiereSonar = reproducir
    this.pedido = { capitulo, posicion, fraseId }
    this.tiempos = null
    this.urls = { u1: null, u2: null }
    this.olvidarPartes()
    this.fraseObjetivo = fraseId
    this.palabraActual = null
    this.poner({
      capitulo,
      posicion,
      duracion: 0,
      fraseId: fraseId,
      fase: 'cargando',
      mensaje: null,
      tipoError: null,
      preparacion: null,
    })
    this.el?.pause()
    const minutos = l.capitulos.find((c) => c.indice === capitulo)?.minutos
    let primera = true
    const desde = this.deps.ahora()
    const pedir = async (): Promise<void> => {
      if (turno !== this.turno) return
      if (this.sondeo) clearTimeout(this.sondeo)
      this.sondeo = null
      let r: ResultDTO<EstadoAudioDTO>
      try {
        // Solo la primera petición de un reintento explícito lleva la marca: los sondeos no.
        r = await this.deps.pedirEstado(
          { ejemplarId: l.ejemplarId, vozId: this.estado.vozId, capitulo },
          reintentar && primera ? { reintentar: true } : undefined,
        )
      } catch {
        if (turno !== this.turno) return
        this.fallar('red', TEXTOS_VOZ.sinRedReintentando)
        this.programarReintento()
        return
      }
      primera = false
      if (turno !== this.turno) return
      this.intentosRed = 0
      if (!r.correct || !r.object) {
        this.fallar('servidor', r.message || MENSAJES.vozFallo)
        return
      }
      const e = r.object
      if (e.estado === 'LISTO') {
        this.saltosSeguidos = 0
        this.urls = { u1: this.deps.resolverUrl(e.url1x), u2: this.deps.resolverUrl(e.url2x) }
        this.errorEnPartes = null
        this.poner({ preparacion: null, ...(e.duracionSeg ? { duracion: e.duracionSeg } : {}) })
        const ut = this.deps.resolverUrl(e.urlTiempos)
        if (ut) {
          this.deps
            .cargarTiempos(ut)
            .then((t) => {
              if (turno !== this.turno || !t) return
              this.tiempos = t
              if (!this.estado.duracion && t.duracion) this.poner({ duracion: t.duracion })
              if (this.fraseObjetivo) {
                const t0 = this.inicioDeFrase(this.fraseObjetivo)
                this.fraseObjetivo = null
                if (t0 != null) this.buscar(t0)
              }
              this.actualizarFrase(true)
            })
            .catch(() => {})
        }
        if (this.enPartes()) {
          // Sonando por partes: se pasa al archivo entero al acabar la parte en curso (sin cortar una frase);
          // si está en pausa o esperando la siguiente parte, ya.
          if (this.esperandoParte) this.aCompleto(this.posicion(), this.quiereSonar)
          else if (this.el?.paused) this.aCompleto(this.posicion(), false)
          return
        }
        this.ponerFuente(posicion, this.quiereSonar)
        return
      }
      if (e.estado === 'ERROR') {
        const motivo = e.error ? `${TEXTOS_VOZ.capituloFallo} ${e.error}` : MENSAJES.vozFallo
        if (this.enPartes() && !this.esperandoParte) {
          // Lo ya generado sigue sonando; el fallo se dice al llegar al final de lo que hay.
          this.errorEnPartes = motivo
          return
        }
        const sig = automatico ? this.vecinoConVoz(capitulo, 1) : -1
        if (sig >= 0 && this.saltosSeguidos < MAX_SALTOS) {
          // Escuchando de corrido, un capítulo que no se pudo generar no para el libro: se sigue con el próximo.
          this.saltosSeguidos++
          this.cargar(sig, 0, this.quiereSonar, null, false, true)
          return
        }
        this.fallar('capitulo', motivo)
        return
      }
      if (e.estado === 'ERROR_CONVERSION') {
        this.fallar('conversion', MENSAJES.libroNoConvertido)
        return
      }
      if (e.urlPartes && this.deps.cargarPartes && (await this.usarPartes(e.urlPartes, turno))) {
        if (turno === this.turno) this.sondeo = setTimeout(pedir, SONDEO_PARTES_MS)
        return
      }
      if (turno !== this.turno) return
      if (this.enPartes()) {
        this.sondeo = setTimeout(pedir, SONDEO_PARTES_MS)
        return
      }
      const previa = this.estado.preparacion
      this.poner({
        fase: 'preparando',
        mensaje:
          e.estado === 'CONVIRTIENDO' ? MENSAJES.libroConvirtiendo : MENSAJES.vozPreparando(this.estado.nombreVoz),
        preparacion:
          e.estado === 'CONVIRTIENDO'
            ? null
            : {
                desde: previa?.desde ?? this.deps.ahora(),
                estimadoSeg: e.estimadoSeg
                  ? estimarPreparacion(null, e.estimadoSeg)
                  : (previa?.estimadoSeg ?? estimarPreparacion(minutos)),
              },
      })
      const rapido = this.deps.ahora() - desde < RAPIDO_DURANTE_MS
      this.sondeo = setTimeout(pedir, rapido ? SONDEO_RAPIDO_MS : SONDEO_MS)
    }
    this.sondearYa = () => {
      if (turno === this.turno) pedir()
    }
    await pedir()
  }

  // ------------------------------------------------------------ partes (v1.5)
  /**
   * Lee el manifiesto de partes y, si se puede, empieza a sonar por partes (o
   * encadena la siguiente si se estaba esperando). Devuelve si suena por partes.
   */
  private async usarPartes(ruta: string, turno: number): Promise<boolean> {
    const url = this.deps.resolverUrl(ruta)
    const cargar = this.deps.cargarPartes
    if (!url || !cargar) return this.enPartes()
    const quedan = (this.partes?.m.partes.length ?? 0) - 1 - this.parteActual
    // Solo se relee cuando hace falta: al empezar, al esperar una parte o si queda poco por delante.
    if (this.enPartes() && !this.esperandoParte && quedan > 1 && !this.fraseObjetivo) return true
    let m: PartesCapitulo | null = null
    try {
      m = await cargar(url)
    } catch {
      m = null
    }
    if (turno !== this.turno) return false
    if (!m || !Array.isArray(m.partes) || !m.partes.length) return this.enPartes()
    this.partes = { url, m }
    if (!this.urls.u1) {
      this.tiempos = { capitulo: m.capitulo, vozId: m.vozId, duracion: m.duracionEstimada, frases: m.frases ?? [] }
      if (m.duracionEstimada > 0) this.poner({ duracion: m.duracionEstimada })
    }
    if (!this.enPartes()) {
      let pos = this.pedido?.posicion ?? 0
      if (this.fraseObjetivo) {
        const t0 = this.inicioDeFrase(this.fraseObjetivo)
        if (t0 == null) return false // esa frase aún no se generó: se sigue preparando
        pos = t0
      }
      const i = this.indiceParte(pos)
      if (i < 0) return false // aún no se llegó hasta ahí
      this.fraseObjetivo = null
      this.ponerParte(i, pos, this.quiereSonar)
      return true
    }
    if (this.fraseObjetivo) {
      const t0 = this.inicioDeFrase(this.fraseObjetivo)
      if (t0 != null && this.indiceParte(t0) >= 0) {
        this.fraseObjetivo = null
        this.buscar(t0)
      }
    }
    if (this.esperandoParte && this.parteActual + 1 < m.partes.length) {
      const sig = m.partes[this.parteActual + 1]
      this.ponerParte(this.parteActual + 1, sig.t0, this.quiereSonar)
    } else if (this.esperandoParte && m.completo) {
      // Era la última parte y el capítulo ya está entero: se sigue como al acabar un capítulo.
      this.esperandoParte = false
      this.alTerminar()
    }
    return true
  }

  /** La parte que contiene `pos` (en una pausa entre dos, la siguiente), o -1 si aún no se ha generado. */
  private indiceParte(pos: number): number {
    const l = this.partes?.m.partes ?? []
    let i = -1
    for (let k = 0; k < l.length; k++) if (l[k].t0 <= pos + 0.001) i = k
    if (i < 0) return l.length ? 0 : -1
    if (pos < l[i].t1 - 0.05) return i
    return i + 1 < l.length ? i + 1 : -1
  }

  /** Pone una parte en el MISMO <audio>, en la posición `pos1x` del capítulo. */
  private ponerParte(i: number, pos1x: number, reproducir: boolean) {
    const el = this.audio()
    const p = this.partes
    if (!el || !p) return
    const parte = p.m.partes[i]
    this.parteActual = i
    this.esperandoParte = false
    this.factor = 1
    this.rate = Math.min(this.estado.velocidad, 4)
    this.posPendiente = Math.max(parte.t0, Math.min(pos1x, parte.t1))
    el.src = p.url.replace(/cap-\d{3}\.partes\.json/, parte.archivo)
    el.playbackRate = this.rate
    el.defaultPlaybackRate = this.rate
    ;(el as AudioExtendido).preservesPitch = true
    try {
      el.load?.()
    } catch {
      /* nada */
    }
    if (reproducir) this.reproducir()
    else if (this.estado.fase === 'cargando' || this.estado.fase === 'preparando')
      this.poner({ fase: 'pausado', mensaje: null, preparacion: null })
    this.sesionMedios()
  }

  /** De las partes al archivo entero, en la misma posición. */
  private aCompleto(pos1x: number, reproducir: boolean) {
    this.olvidarPartes()
    this.ponerFuente(pos1x, reproducir)
  }

  /** Sin red: se vuelve a pedir solo, cada vez esperando un poco más. */
  private programarReintento() {
    if (this.reintento) clearTimeout(this.reintento)
    const espera = REINTENTOS_MS[Math.min(this.intentosRed, REINTENTOS_MS.length - 1)]
    this.intentosRed++
    this.reintento = setTimeout(() => {
      this.reintento = null
      if (this.estado.fase === 'error' && this.estado.tipoError === 'red') this.reintentar()
    }, espera)
  }

  /**
   * Vuelve a pedir el capítulo que falló, desde donde iba. Si el servidor dijo
   * ERROR, la petición lleva la marca de reintento explícito (contrato v1.2).
   */
  reintentar() {
    const l = this.estado.libro
    if (!l) return
    const tipo = this.estado.tipoError
    const p = this.pedido ?? { capitulo: this.estado.capitulo, posicion: this.estado.posicion, fraseId: null }
    const pos = tipo === 'audio' ? this.estado.posicion : p.posicion
    const frase = tipo === 'audio' ? null : p.fraseId
    this.cargar(p.capitulo, pos, true, frase, tipo === 'capitulo')
  }

  /** Pone en el <audio> el archivo que toca para la velocidad actual, conservando la posición. */
  private ponerFuente(pos1x: number, reproducir: boolean) {
    const el = this.audio()
    if (!el) return
    const plan = planDeVelocidad(this.estado.velocidad)
    let src = plan.variante === '2x' ? this.urls.u2 : this.urls.u1
    let factor = plan.factor
    let rate = plan.rate
    if (!src && plan.variante === '2x' && this.urls.u1) {
      // Sin variante 2x: el 1x estirado al máximo que el navegador permite.
      src = this.urls.u1
      factor = 1
      rate = Math.min(this.estado.velocidad, 4)
    }
    if (!src) return
    this.factor = factor
    this.rate = rate
    const absoluto = (u: string) => {
      try {
        return new URL(u, typeof location !== 'undefined' ? location.href : 'http://x/').href
      } catch {
        return u
      }
    }
    if (el.src !== absoluto(src) && el.src !== src) {
      this.posPendiente = pos1x
      el.src = src
      el.playbackRate = rate
      el.defaultPlaybackRate = rate
      try {
        el.load?.()
      } catch {
        /* nada */
      }
    } else {
      this.posPendiente = null
      el.currentTime = tiempoEnArchivo(pos1x, factor)
    }
    el.playbackRate = rate
    ;(el as AudioExtendido).preservesPitch = true
    if (reproducir) this.reproducir()
    else if (this.estado.fase === 'cargando' || this.estado.fase === 'preparando')
      // Listo y en pausa: el «Preparando…» ya no es verdad (QA LV-09).
      this.poner({ fase: 'pausado', mensaje: null, preparacion: null })
    this.sesionMedios()
  }

  private alCargarMetadatos = () => {
    const el = this.el
    if (!el) return
    if (this.posPendiente != null) {
      try {
        const parte = this.enPartes() ? this.partes?.m.partes[this.parteActual] : null
        el.currentTime = parte
          ? Math.max(0, this.posPendiente - parte.t0)
          : tiempoEnArchivo(this.posPendiente, this.factor)
      } catch {
        /* nada */
      }
      this.posPendiente = null
    }
    el.defaultPlaybackRate = this.rate
    el.playbackRate = this.rate
    if (!this.estado.duracion && Number.isFinite(el.duration) && !this.enPartes())
      this.poner({ duracion: tiempoEn1x(el.duration, this.factor) })
  }

  // ------------------------------------------------------------ controles
  reproducir() {
    const el = this.audio()
    if (!el || !this.estado.libro) return
    this.quiereSonar = true
    if (this.estado.fase === 'error') {
      // ▶ en un fallo = reintentar ya (también desde la pantalla de bloqueo).
      if (this.estado.tipoError !== 'conversion') this.reintentar()
      return
    }
    if (!this.hayAudio()) return // aún preparando: sonará en cuanto esté
    if (this.esperandoParte) return // sonará en cuanto llegue la siguiente parte
    if (this.ultimaPausa && this.deps.ahora() - this.ultimaPausa > PAUSA_LARGA_MS && this.tiempos) {
      // Tras una pausa larga se vuelve una frase atrás, para retomar el hilo.
      const i = buscarFrase(this.tiempos.frases, this.posicion())
      const anterior = this.tiempos.frases[Math.max(0, i - 1)]
      if (anterior) this.buscar(anterior.t0)
    }
    this.ultimaPausa = 0
    const p = el.play()
    if (p && typeof p.catch === 'function') {
      p.catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name === 'NotAllowedError')
          this.poner({ fase: 'pausado', mensaje: MENSAJES.vozToqueParaEmpezar })
      })
    }
  }

  pausar() {
    this.quiereSonar = false
    this.el?.pause()
  }

  alternar() {
    const f = this.estado.fase
    if (f === 'reproduciendo' || ((f === 'preparando' || f === 'cargando') && this.quiereSonar)) this.pausar()
    else this.reproducir()
  }

  /** Posición actual en la línea de tiempo 1x. */
  posicion(): number {
    const el = this.el
    if (!el || !this.hayAudio()) return this.estado.posicion
    if (this.posPendiente != null) return this.posPendiente
    const parte = this.enPartes() ? this.partes?.m.partes[this.parteActual] : null
    if (parte) return parte.t0 + (el.currentTime || 0)
    return tiempoEn1x(el.currentTime || 0, this.factor)
  }

  buscar(pos1x: number) {
    const el = this.el
    const max = this.estado.duracion || Number.MAX_SAFE_INTEGER
    let p = Math.max(0, Math.min(max - 0.05, pos1x))
    if (el && this.enPartes()) {
      const sonando = this.estado.fase === 'reproduciendo' || this.esperandoParte
      if (this.urls.u1) return this.aCompleto(p, sonando)
      const l = this.partes?.m.partes ?? []
      let i = this.indiceParte(p)
      if (i < 0) {
        // Más allá de lo generado: se va a lo último que hay.
        i = l.length - 1
        p = Math.max(l[i].t0, l[i].t1 - 1)
      }
      if (i !== this.parteActual || this.esperandoParte) this.ponerParte(i, p, sonando)
      else if (this.posPendiente != null) this.posPendiente = Math.max(l[i].t0, p)
      else el.currentTime = Math.max(0, p - l[i].t0)
    } else if (el && this.urls.u1) {
      if (this.posPendiente != null) this.posPendiente = p
      else el.currentTime = tiempoEnArchivo(p, this.factor)
    }
    this.poner({ posicion: p })
    this.actualizarFrase(true)
    this.posicionSesion()
  }

  saltar(segundos: number) {
    this.buscar(this.posicion() + segundos)
  }
  atras15 = () => this.saltar(-SALTO_SEG)
  adelante15 = () => this.saltar(SALTO_SEG)

  fraseSiguiente() {
    if (!this.tiempos) return this.adelante15()
    const t = inicioFraseSiguiente(this.tiempos.frases, this.posicion())
    // Por partes, «después de lo generado» no es el final del capítulo.
    if (t == null && this.enPartes() && !this.urls.u1 && !this.partes?.m.completo) return
    if (t == null) this.capituloSiguiente()
    else this.buscar(t)
  }

  fraseAnterior() {
    if (!this.tiempos) return this.atras15()
    const pos = this.posicion()
    const i = buscarFrase(this.tiempos.frases, pos)
    if (i < 0) return this.buscar(0)
    const t =
      pos - this.tiempos.frases[i].t0 > 1.5 ? this.tiempos.frases[i].t0 : this.tiempos.frases[Math.max(0, i - 1)].t0
    this.buscar(t)
  }

  /** Lo que el usuario quiere al cambiar de capítulo: seguir como estaba (sonando o no). */
  private seguirSonando() {
    return this.estado.fase === 'reproduciendo' || this.quiereSonar
  }

  capituloSiguiente() {
    const l = this.estado.libro
    if (!l) return
    // Un capítulo que no se llegó a oír por falta de red no se salta: se reintenta (QA LV-02).
    if (this.estado.fase === 'error' && (this.estado.tipoError === 'red' || this.estado.tipoError === 'audio'))
      return this.reintentar()
    const sig = this.vecinoConVoz(this.estado.capitulo, 1)
    if (sig >= 0) this.cargar(sig, 0, this.seguirSonando())
  }

  capituloAnterior() {
    if (this.estado.fase !== 'error' && (this.posicion() > 5 || this.estado.capitulo === 0)) return this.buscar(0)
    if (this.estado.capitulo === 0) return this.reintentar()
    const ant = this.vecinoConVoz(this.estado.capitulo, -1)
    this.cargar(ant >= 0 ? ant : this.estado.capitulo - 1, 0, this.seguirSonando())
  }

  irACapitulo(capitulo: number, reproducir = true) {
    this.cargar(capitulo, 0, reproducir)
  }

  /** "Escuchar desde aquí": salta a la frase (cargando su capítulo si hace falta). */
  irAFrase(fraseId: string, reproducir = true) {
    const cap = capituloDeFrase(fraseId)
    if ((cap >= 0 && cap !== this.estado.capitulo) || this.estado.fase === 'error') {
      this.cargar(cap >= 0 ? cap : this.estado.capitulo, 0, reproducir, fraseId)
      return
    }
    const t0 = this.inicioDeFrase(fraseId)
    if (t0 != null) this.buscar(t0)
    else this.fraseObjetivo = fraseId
    if (reproducir) this.reproducir()
  }

  setVelocidad(v: number) {
    const nueva = normalizarVelocidad(v)
    const antes = planDeVelocidad(this.estado.velocidad)
    const despues = planDeVelocidad(nueva)
    const pos = this.posicion()
    const sonando = this.estado.fase === 'reproduciendo'
    this.poner({ velocidad: nueva })
    if (!this.el || !this.hayAudio()) return
    if (this.enPartes()) {
      // Las partes solo existen a 1x: se acelera el propio archivo.
      this.rate = Math.min(nueva, 4)
      this.el.defaultPlaybackRate = this.rate
      this.el.playbackRate = this.rate
      this.posicionSesion()
      return
    }
    if (antes.variante !== despues.variante) this.ponerFuente(pos, sonando)
    else {
      this.rate = this.factor === 2 ? despues.rate : Math.min(nueva, 4)
      this.el.defaultPlaybackRate = this.rate
      this.el.playbackRate = this.rate
      this.posicionSesion()
    }
  }

  // ------------------------------------------------------------ cambiar de voz
  private cancelarVozPendiente() {
    this.turnoVoz++
    if (this.sondeoVoz) clearTimeout(this.sondeoVoz)
    this.sondeoVoz = null
  }

  /**
   * Cambia la voz. Si la actual está sonando, sigue sonando mientras el taller
   * prepara la nueva (QA LV-07) y se cambia en la misma frase cuando está LISTA.
   * Si no suena, se carga ya conservando lo que el usuario quería (▶ o ⏸).
   */
  setVoz(vozId: string, nombreVoz: string) {
    const pendiente = this.estado.vozPendiente
    if (vozId === this.estado.vozId) {
      if (pendiente) {
        this.cancelarVozPendiente()
        this.poner({ vozPendiente: null })
      }
      return
    }
    if (!this.estado.libro) {
      this.poner({ vozId, nombreVoz })
      return
    }
    const sonando = this.estado.fase === 'reproduciendo' && this.hayAudio()
    if (sonando) {
      this.cancelarVozPendiente()
      const minutos = this.estado.libro.capitulos.find((c) => c.indice === this.estado.capitulo)?.minutos
      this.poner({
        vozPendiente: {
          id: vozId,
          nombre: nombreVoz,
          desde: this.deps.ahora(),
          estimadoSeg: estimarPreparacion(minutos),
        },
      })
      this.sondearVozPendiente()
      return
    }
    this.cancelarVozPendiente()
    const pos = this.posicion()
    const frase = this.estado.fraseId
    const reproducir = this.quiereSonar
    this.poner({ vozId, nombreVoz, vozPendiente: null })
    this.cargar(this.estado.capitulo, frase ? 0 : pos, reproducir, frase)
  }

  private async sondearVozPendiente() {
    const p = this.estado.vozPendiente
    const l = this.estado.libro
    if (!p || !l) return
    const turno = ++this.turnoVoz
    const capitulo = this.estado.capitulo
    let r: ResultDTO<EstadoAudioDTO> | null = null
    try {
      r = await this.deps.pedirEstado({ ejemplarId: l.ejemplarId, vozId: p.id, capitulo })
    } catch {
      r = null
    }
    if (turno !== this.turnoVoz || this.estado.vozPendiente?.id !== p.id) return
    const e = r?.correct ? r.object : null
    const abandonar = () => {
      this.poner({ vozPendiente: null, mensaje: TEXTOS_VOZ.vozNuevaNoLista(p.nombre, this.estado.nombreVoz) })
    }
    if (r && (!r.correct || !e)) return abandonar()
    if (e?.estado === 'ERROR' || e?.estado === 'ERROR_CONVERSION') return abandonar()
    if (e?.estado === 'LISTO' && capitulo === this.estado.capitulo) {
      // Cambio en la frase que suena ahora mismo, sin silencio de espera.
      const frase = this.estado.fraseId
      const pos = this.posicion()
      const sonar = this.quiereSonar || this.estado.fase === 'reproduciendo'
      this.poner({ vozId: p.id, nombreVoz: p.nombre, vozPendiente: null })
      this.cargar(this.estado.capitulo, frase ? 0 : pos, sonar, frase)
      return
    }
    if (e?.urlPartes && this.deps.cargarPartes && capitulo === this.estado.capitulo) {
      // v1.5: si las partes de la voz nueva ya llegan a la frase que suena, se cambia ya (sin esperar al final).
      const url = this.deps.resolverUrl(e.urlPartes)
      const m = url ? await this.deps.cargarPartes(url).catch(() => null) : null
      if (turno !== this.turnoVoz || this.estado.vozPendiente?.id !== p.id) return
      const frase = this.estado.fraseId
      const ultima = m?.partes?.length ? m.partes[m.partes.length - 1].t1 : -1
      const t0 = frase ? m?.frases?.find((f) => f.id === frase)?.t0 : undefined
      if (frase && t0 != null && t0 < ultima - 0.05) {
        const sonar = this.quiereSonar || this.estado.fase === 'reproduciendo'
        this.poner({ vozId: p.id, nombreVoz: p.nombre, vozPendiente: null })
        this.cargar(this.estado.capitulo, 0, sonar, frase)
        return
      }
    }
    if (e?.estimadoSeg) this.poner({ vozPendiente: { ...p, estimadoSeg: estimarPreparacion(null, e.estimadoSeg) } })
    this.sondeoVoz = setTimeout(() => this.sondearVozPendiente(), SONDEO_MS)
  }

  // ------------------------------------------------------------ temporizador
  setTemporizador(t: { minutos: number } | 'capitulo' | null) {
    const el = this.el
    if (el) el.volume = 1
    if (t === null) return this.poner({ temporizador: null })
    if (t === 'capitulo') return this.poner({ temporizador: { tipo: 'capitulo' } })
    this.poner({ temporizador: { tipo: 'minutos', minutos: t.minutos, finEn: this.deps.ahora() + t.minutos * 60_000 } })
  }

  private revisarTemporizador() {
    const t = this.estado.temporizador
    const el = this.el
    if (!t || t.tipo !== 'minutos' || !el) return
    const falta = t.finEn - this.deps.ahora()
    if (falta <= 0) {
      this.quiereSonar = false
      el.pause()
      el.volume = 1
      this.poner({ temporizador: null, mensaje: MENSAJES.vozTemporizador })
    } else if (falta < FUNDIDO_MS) {
      // Fundido de 10 s (en iOS el volumen es de solo lectura: ahí simplemente se pausa al final).
      el.volume = Math.max(0, Math.min(1, falta / FUNDIDO_MS))
    }
  }

  // ------------------------------------------------------------ eventos del audio
  private alAvanzar = () => {
    const el = this.el
    if (!el || el.src === SILENCIO || !this.hayAudio()) return
    const pos = this.posicion()
    if (Math.abs(pos - this.ultimaPosSesion) >= 1) {
      this.ultimaPosSesion = pos
      this.posicionSesion()
    }
    this.poner({ posicion: pos })
    this.actualizarFrase(false)
    this.revisarTemporizador()
    const ahora = this.deps.ahora()
    if (ahora - this.ultimoLocal >= CADA_LOCAL_MS) this.guardar(false)
    if (ahora - this.ultimoServidor >= CADA_SERVIDOR_MS) this.guardar(true)
  }

  private alTerminar = () => {
    const l = this.estado.libro
    if (!l || !this.hayAudio()) return
    const p = this.enPartes() ? this.partes?.m : null
    if (p) {
      const ultima = this.parteActual >= p.partes.length - 1
      const finDelCapitulo = ultima && (p.completo || !!this.urls.u1)
      if (!finDelCapitulo) {
        const siguiente = p.partes[this.parteActual + 1]
        // El capítulo entero ya está: se sigue en él desde la próxima frase.
        if (this.urls.u1) return this.aCompleto(siguiente?.t0 ?? p.partes[this.parteActual].t1, true)
        if (siguiente) return this.ponerParte(this.parteActual + 1, siguiente.t0, true)
        if (this.errorEnPartes) return this.fallar('capitulo', this.errorEnPartes)
        // La siguiente parte aún no está: se espera con el ▶ puesto y se pregunta ya.
        this.esperandoParte = true
        this.quiereSonar = true
        this.poner({ fase: 'preparando', mensaje: TEXTOS_VOZ.continuacion, preparacion: null })
        this.sondearYa?.()
        return
      }
    }
    if (this.estado.temporizador?.tipo === 'capitulo') {
      this.quiereSonar = false
      this.poner({ temporizador: null, fase: 'pausado', mensaje: MENSAJES.vozFinCapitulo })
      this.guardar(true)
      return
    }
    const sig = this.vecinoConVoz(this.estado.capitulo, 1)
    if (sig >= 0) {
      // Mismo elemento, nuevo src: así iOS sigue sonando con la pantalla bloqueada.
      this.saltosSeguidos = 0
      this.cargar(sig, 0, true, null, false, true)
    } else {
      this.quiereSonar = false
      this.poner({ fase: 'pausado', mensaje: MENSAJES.vozFinLibro })
      this.guardar(true)
    }
  }

  private actualizarFrase(forzar: boolean) {
    if (!this.tiempos) return
    const pos = this.posicion()
    const i = buscarFrase(this.tiempos.frases, pos)
    const f = i >= 0 ? this.tiempos.frases[i] : null
    let palabra: [number, number] | null = null
    if (f && resaltaPalabra(this.estado.velocidad) && f.palabras.length) {
      const j = buscarPalabra(f.palabras, pos)
      if (j >= 0) palabra = [f.palabras[j][0], f.palabras[j][1]]
    }
    const id = f?.id ?? null
    const cambioPalabra = palabra?.[0] !== this.palabraActual?.[0] || palabra?.[1] !== this.palabraActual?.[1]
    if (forzar || id !== this.estado.fraseId || cambioPalabra) {
      this.palabraActual = palabra
      if (id !== this.estado.fraseId) this.poner({ fraseId: id })
      this.emitirFrase()
    }
  }

  /** Mientras suena y se ve, la palabra se sigue a 60 fps (timeupdate solo llega 4 veces por segundo). */
  private arrancarRaf() {
    if (this.raf != null || typeof requestAnimationFrame === 'undefined') return
    const paso = () => {
      this.raf = null
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
      if (this.estado.fase !== 'reproduciendo' || !this.oyentesFrase.size || !visible) return
      this.actualizarFrase(false)
      this.raf = requestAnimationFrame(paso)
    }
    this.raf = requestAnimationFrame(paso)
  }

  // ------------------------------------------------------------ progreso
  progresoActual(): ProgresoDTO | null {
    const l = this.estado.libro
    if (!l) return null
    const pos = this.posicion()
    const caps = l.capitulos
    const total = caps.reduce((a, c) => a + (c.minutos || 0), 0)
    const previos = caps.filter((c) => c.indice < this.estado.capitulo).reduce((a, c) => a + (c.minutos || 0), 0)
    const actual = caps.find((c) => c.indice === this.estado.capitulo)?.minutos || 0
    const frac = this.estado.duracion ? Math.min(1, pos / this.estado.duracion) : 0
    const porcentaje = total ? Math.min(100, ((previos + frac * actual) / total) * 100) : 0
    return {
      ejemplarId: l.ejemplarId,
      capitulo: this.estado.capitulo,
      fraseId: this.estado.fraseId,
      cfi: null,
      posicionAudioSeg: Number(acotar(pos, 0, Number.MAX_SAFE_INTEGER, 0).toFixed(2)),
      vozId: this.estado.vozId,
      // Contrato v1.2: el servidor acepta 0.25–5; se acota por si llega algo raro (nunca NaN).
      velocidad: acotar(this.estado.velocidad, VELOCIDAD_PROGRESO.min, VELOCIDAD_PROGRESO.max, 1),
      porcentaje: Number(acotar(porcentaje, 0, 100, 0).toFixed(2)),
      modo: 'VOZ',
      dispositivo: this.deps.dispositivo(),
      actualizadoEn: new Date(this.deps.ahora()).toISOString(),
    }
  }

  guardar(servidor: boolean) {
    const p = this.progresoActual()
    if (!p || !this.hayAudio()) return
    const ahora = this.deps.ahora()
    this.ultimoLocal = ahora
    this.deps.guardarLocal(p).catch?.(() => {})
    if (servidor) {
      this.ultimoServidor = ahora
      Promise.resolve(this.deps.guardarServidor(p)).catch((e) =>
        console.error('[voz] no se pudo guardar el progreso', e),
      )
    }
  }

  /**
   * Deja de sonar y olvida el libro: al cerrar sesión, al caducar o al entrar
   * otra cuenta (QA LV-03). Con `servidor: false` (la sesión ya caducó y el
   * servidor contestaría 401) lo último se guarda solo en el teléfono.
   */
  detener(o: { servidor?: boolean } = {}) {
    this.turno++
    this.cancelarSondeo()
    this.cancelarVozPendiente()
    this.guardar(o.servidor ?? true)
    this.quiereSonar = false
    this.pedido = null
    // Sin URLs antes de pausar: el 'pause' ya no guarda (con la sesión caducada daría 401).
    this.urls = { u1: null, u2: null }
    this.olvidarPartes()
    this.sondearYa = null
    this.tiempos = null
    this.el?.pause()
    this.poner({ ...inicial })
    this.limpiarSesionMedios()
  }

  // ------------------------------------------------------------ Media Session (pantalla de bloqueo)
  private sesionMedios() {
    const ms = sesion()
    const l = this.estado.libro
    if (!ms || !l) return
    try {
      const cap = l.capitulos.find((c) => c.indice === this.estado.capitulo)
      const MM = (globalThis as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata
      if (MM) {
        ms.metadata = new MM({
          title: cap?.titulo || `Capítulo ${this.estado.capitulo + 1}`,
          artist: l.autores.join(', '),
          album: l.titulo,
          artwork: l.portadaUrl
            ? [
                {
                  src: l.portadaUrl,
                  sizes: '600x900',
                  type: l.portadaUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg',
                },
              ]
            : [],
        })
      }
      const h = (accion: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
        try {
          ms.setActionHandler(accion, fn)
        } catch {
          /* acción no soportada en este navegador */
        }
      }
      h('play', () => this.reproducir())
      h('pause', () => this.pausar())
      h('seekbackward', (d) => this.saltar(-(d?.seekOffset || SALTO_SEG)))
      h('seekforward', (d) => this.saltar(d?.seekOffset || SALTO_SEG))
      h('previoustrack', () => this.capituloAnterior())
      h('nexttrack', () => this.capituloSiguiente())
      // La pantalla de bloqueo ve la línea de tiempo 1x del capítulo (ver posicionSesion).
      h('seekto', (d) => d?.seekTime != null && this.buscar(d.seekTime))
      this.estadoSesion(this.estado.fase === 'reproduciendo' ? 'playing' : 'paused')
      this.posicionSesion()
    } catch (e) {
      console.error('[voz] Media Session', e)
    }
  }

  private limpiarSesionMedios() {
    const ms = sesion()
    if (!ms) return
    try {
      ms.metadata = null
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto'])
        try {
          ms.setActionHandler(a as MediaSessionAction, null)
        } catch {
          /* no soportada */
        }
      ms.playbackState = 'none'
    } catch {
      /* nada */
    }
  }

  private estadoSesion(s: MediaSessionPlaybackState) {
    const ms = sesion()
    try {
      if (ms) ms.playbackState = s
    } catch {
      /* nada */
    }
  }

  /**
   * La posición en la pantalla de bloqueo, en la línea de tiempo 1x del
   * capítulo y a la velocidad elegida (QA LV-P5): con el archivo 2x la
   * duración del archivo es la mitad y engañaba.
   */
  private posicionSesion() {
    const ms = sesion()
    const el = this.el
    const duracion = this.estado.duracion
    if (!ms?.setPositionState || !el || !(duracion > 0)) return
    try {
      ms.setPositionState({
        duration: duracion,
        playbackRate: this.estado.velocidad || 1,
        position: Math.min(duracion, Math.max(0, this.posicion())),
      })
    } catch {
      /* posición fuera de rango mientras cambia el src */
    }
  }
}
