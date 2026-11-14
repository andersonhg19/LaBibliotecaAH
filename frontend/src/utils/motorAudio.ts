import { buscarFrase, buscarPalabra, capituloDeFrase, indiceDeFrase, inicioFraseSiguiente } from '@logica/tiempos'
import { normalizarVelocidad, planDeVelocidad, resaltaPalabra, tiempoEn1x, tiempoEnArchivo } from '@logica/velocidad'
import type { CapituloResumen, EstadoAudioDTO, PartesCapitulo, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
import type { Cinta } from '@utils/cinta'
import { FalloCinta, clasificarFallo } from '@utils/fallosCinta'
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

/**
 * El temporizador. Por minutos solo cuenta mientras suena (RP-14): al pausar se
 * guarda lo que faltaba en `pausadoCon` (ms) y al volver a sonar se reanuda.
 */
export type Temporizador =
  { tipo: 'minutos'; minutos: number; finEn: number; pausadoCon?: number } | { tipo: 'capitulo' } | null

/** Cuánto falta del temporizador por minutos, en segundos (contando la pausa), o null. */
export function faltaTemporizador(t: Temporizador, ahora: number): number | null {
  if (t?.tipo !== 'minutos') return null
  const ms = t.pausadoCon ?? t.finEn - ahora
  return Math.max(0, Math.round(ms / 1000))
}

/** El sello del progreso (F10): guardado en casa a tal hora, o pendiente de la red. */
export type Guardado = { estado: 'ok'; en: number } | { estado: 'pendiente'; en: number } | null

/** Lo que el motor manda como latido de la sesión de escucha (contrato C4). */
export interface LatidoVoz {
  ejemplarId: string
  modo: 'VOZ'
  sesionId: string
  capitulo: number
  posicion: number
  /** Segundos escuchados desde el latido anterior (0–120). */
  segundos: number
  dispositivo?: string
}

/**
 * El capítulo con voz que va después (o antes) de `desde` en la lista, o -1.
 * No se oyen, escuchando de corrido: una página sin palabras (minutos 0) ni un
 * capítulo apartado de la voz (`enVoz: false`, contrato C3). Elegido a mano, sí.
 */
export function vecinoConVoz(caps: readonly CapituloResumen[], desde: number, paso: 1 | -1): number {
  const i0 = caps.findIndex((c) => c.indice === desde)
  const inicio = i0 >= 0 ? i0 : desde
  for (let i = inicio + paso; i >= 0 && i < caps.length; i += paso) {
    const c = caps[i]
    if (c.enVoz === false) continue
    if ((c.minutosVoz ?? c.minutos) === 0) continue
    return c.indice
  }
  return -1
}

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
  /** Se llegó al final del libro (la pantalla ofrece «Volver a empezar», RP-02). */
  finDelLibro: boolean
  /** Cuánto ha bajado el capítulo que se pone en la cinta (0–1), para el anillo del ▶ (F6); null si no se sabe. */
  carga: number | null
  /** La escucha continua del iPhone (cinta): activa, apagada tras fallos repetidos (se avisa), o null si no aplica. */
  escuchaContinua: 'activa' | 'apagada' | null
  /** El último guardado del progreso en el servidor (F10). */
  guardado: Guardado
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
  /** (2026-11-12) La cinta continua (iPhone): un MediaSource con los capítulos seguidos. Null = <audio> normal. */
  cinta?: (el: HTMLAudioElement) => Cinta | null
  /** (0.4.0, C4) Latido de la sesión de escucha: cada minuto sonando y al pausar. */
  latido?: (d: LatidoVoz) => Promise<unknown>
  /** Un identificador nuevo para cada sesión de escucha (uuid). */
  nuevoId?: () => string
}

/** El capítulo siguiente pedido antes de que acabe el actual (para pasar a él sin esperar al servidor). */
interface Precarga {
  clave: string
  capitulo: number
  vozId: string
  desde: number
  pidiendo: boolean
  listo: boolean
  u1: string | null
  u2: string | null
  ut: string | null
  duracion: number
  /** La URL que ya se mandó a la cinta. */
  enCinta: string | null
  /** Fallos al ponerlo en la cinta y cuándo se puede volver a probar (RP-03: nunca en cada timeupdate). */
  fallos: number
  reintentoEn: number
  /** No se vuelve a intentar: al acabar el capítulo se pide como siempre (con URL y token nuevos). */
  fallida: boolean
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
  /** RP-01: tras «Al final del capítulo», ▶ sigue con el siguiente; se dice cuál. */
  finCapituloSigue: (titulo: string) =>
    `Fin del capítulo. El temporizador apagó la voz; toca ▶ para seguir con «${titulo}».`,
  /** RP-02: al acabar el libro. */
  finLibro: 'Has terminado el libro.',
  /** RP-04: la cinta (escucha continua del iPhone) se apagó tras fallar varias veces. */
  cintaApagada:
    'La escucha continua se apagó por un fallo: con la pantalla bloqueada la voz puede pararse al cambiar de capítulo.',
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
/**
 * Cuántos segundos antes del final se pide el capítulo siguiente: al acabar, se pasa a él en el mismo instante,
 * sin esperar al servidor (con la pantalla bloqueada, iOS congela la página en esa espera; WebKit 173332).
 */
const PRECARGA_SEG = 45
/** Escuchando de corrido, cuántos capítulos en ERROR seguidos se saltan antes de parar y decirlo. */
const MAX_SALTOS = 3
/** RP-03: intentos de poner en la cinta el capítulo siguiente antes de dejarlo para el final del capítulo. */
const MAX_FALLOS_PRECARGA = 3
/** RP-04: fallos de la plataforma seguidos antes de apagar la cinta (y avisarlo). */
const MAX_FALLOS_CINTA = 2
/** RP-18: intentos de leer tiempos.json (con espera creciente y al volver la red). */
const MAX_INTENTOS_TIEMPOS = 6
/** C4: cada cuánto se manda el latido de la sesión mientras suena, y el máximo que acepta el servidor. */
const LATIDO_MS = 60_000
const LATIDO_MAX_SEG = 120
/** Un hueco entre dos timeupdate mayor que esto no se cuenta entero (página congelada). */
const TICK_MAX_MS = 15_000
/** Tras esta pausa, volver a sonar es otra sesión de escucha. */
const SESION_NUEVA_MS = 30 * 60 * 1000

/** Un uuid v4 (crypto.randomUUID si está; si no, uno con Math.random, suficiente para agrupar latidos). */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

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
  finDelLibro: false,
  carga: null,
  escuchaContinua: null,
  guardado: null,
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
  /** El capítulo siguiente, ya pedido (y LISTO) antes de que acabe el actual. */
  private precarga: Precarga | null = null
  /** La cinta continua (solo iPhone/iPad) y si se está llenando con un capítulo nuevo. */
  private cinta: Cinta | null = null
  /** Cargas de la cinta en vuelo (RP-12: un contador, no un sí/no; con dos seguidas la primera no lo apaga). */
  private cargasCinta = 0
  /** La URL que se está poniendo en la cinta (para contar lo que baja, F6). */
  private srcCargando: string | null = null
  /** Fallos de la plataforma seguidos al poner la cinta (RP-04). */
  private fallosCinta = 0
  /** Fallos 401/403/404 seguidos del capítulo pedido: el primero se reintenta solo (URL con token nuevo). */
  private fallosAcceso = 0
  /** El tramo de la cinta cuyo final ya se atendió (para no pasar dos veces de capítulo). */
  private finAvisado: unknown = null
  /** RP-01: el temporizador «Al final del capítulo» paró aquí; ▶ sigue con el siguiente. */
  private paradoAlFinal = false
  /** RP-18: tiempos.json que falló y se vuelve a pedir. */
  private tiemposPendientes: {
    url: string
    turno: number
    intentos: number
    proximo: number
    enVuelo: boolean
  } | null = null
  /** C4: la sesión de escucha (para los latidos). */
  private sesionVoz: {
    id: string
    ejemplarId: string
    acumulado: number
    ultimoTick: number | null
    ultimoEnvio: number
    ultimaVez: number
  } | null = null

  constructor(private deps: DependenciasMotor) {
    deps.alVolverLaRed?.(() => {
      if (this.estado.fase === 'error' && this.estado.tipoError === 'red') this.reintentar()
      // Lo que no se pudo guardar o leer sin red, ahora.
      if (this.estado.guardado?.estado === 'pendiente') this.guardar(true)
      if (!this.tiempos && this.tiemposPendientes) this.pedirTiempos(true)
    })
  }

  /** ¿Se está llenando la cinta con un capítulo nuevo? */
  private get cargandoCinta(): boolean {
    return this.cargasCinta > 0
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
   * Tampoco los capítulos apartados de la voz (`enVoz: false`, 0.4.0): no se piden ni se precargan.
   */
  private vecinoConVoz(desde: number, paso: 1 | -1): number {
    return vecinoConVoz(this.estado.libro?.capitulos ?? [], desde, paso)
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
    // Safari (16.4+): esto es reproducción, no un sonido de fondo de la página.
    try {
      const sesionAudio = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
      if (sesionAudio) sesionAudio.type = 'playback'
    } catch {
      /* no soportado */
    }
    try {
      this.cinta = this.deps.cinta?.(el) ?? null
    } catch (e) {
      console.error('[voz] sin cinta', e)
      this.cinta = null
    }
    if (this.cinta) {
      const c = this.cinta
      c.alProgresar = (url, f) => this.alProgresarCinta(url, f)
      c.alCerrarse = () => this.rehacerCinta()
      c.alFallarDescarga = (url, e) => this.alFallarDescarga(url, e)
      this.poner({ escuchaContinua: 'activa' })
    }
    el.addEventListener('timeupdate', this.alAvanzar)
    el.addEventListener('ended', this.alTerminar)
    // En la cinta no hay 'ended': al quedarse sin datos al final de un capítulo, se mira si toca pasar al siguiente.
    el.addEventListener('waiting', () => this.vigilarFinCinta())
    el.addEventListener('play', () => {
      // El silencio de desbloqueo no es "sonar": no debe tapar el «Preparando…».
      if (!this.estado.libro || el.src === SILENCIO) return
      this.alEmpezarASonar()
    })
    el.addEventListener('pause', () => {
      if (el.src === SILENCIO) return
      if (this.estado.fase === 'reproduciendo') this.poner({ fase: 'pausado' })
      this.ultimaPausa = this.deps.ahora()
      this.pausarTemporizador()
      this.guardar(true)
      this.latir(true)
      this.estadoSesion('paused')
    })
    el.addEventListener('loadedmetadata', this.alCargarMetadatos)
    el.addEventListener('error', () => {
      // Mientras se rehace la cinta, el <audio> se queda un instante sin fuente: no es un fallo del capítulo.
      if (this.cargandoCinta) return
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
    if (this.pedido?.capitulo !== capitulo) this.fallosAcceso = 0
    this.pedido = { capitulo, posicion, fraseId }
    this.tiempos = null
    this.tiemposPendientes = null
    this.urls = { u1: null, u2: null }
    this.olvidarPartes()
    this.fraseObjetivo = fraseId
    this.palabraActual = null
    this.paradoAlFinal = false
    // Una precarga en vuelo de antes (otra voz, otro capítulo) ya no vale (RP-06).
    this.precarga = null
    this.poner({
      capitulo,
      posicion,
      duracion: 0,
      fraseId: fraseId,
      fase: 'cargando',
      mensaje: null,
      tipoError: null,
      preparacion: null,
      finDelLibro: false,
      carga: null,
    })
    // Al llegar solo (fin del anterior) no se pausa: en la cinta el <audio> sigue «sonando» mientras llega el capítulo.
    if (!automatico) this.el?.pause()
    this.finAvisado = null
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
        this.leerTiempos(this.deps.resolverUrl(e.urlTiempos), turno)
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

  /**
   * Lee tiempos.json del capítulo cargado (frases y palabras) y, si se pidió una frase, va a ella. Si falla
   * (sin red), se vuelve a pedir con espera creciente y al volver la red (RP-18): sin él no hay resaltado.
   */
  private leerTiempos(ut: string | null, turno: number) {
    if (!ut) return
    this.tiemposPendientes = { url: ut, turno, intentos: 0, proximo: 0, enVuelo: false }
    this.pedirTiempos(true)
  }

  private pedirTiempos(ya = false) {
    const tp = this.tiemposPendientes
    if (!tp || tp.enVuelo || tp.turno !== this.turno) return
    const ahora = this.deps.ahora()
    if (!ya && (ahora < tp.proximo || tp.intentos >= MAX_INTENTOS_TIEMPOS)) return
    tp.enVuelo = true
    tp.intentos++
    tp.proximo = ahora + Math.min(30_000, 2_000 * 2 ** tp.intentos)
    const fallo = () => {
      tp.enVuelo = false
    }
    this.deps
      .cargarTiempos(tp.url)
      .then((t) => {
        tp.enVuelo = false
        if (tp.turno !== this.turno || this.tiemposPendientes !== tp) return
        if (!t) return fallo()
        this.tiemposPendientes = null
        this.tiempos = t
        if (!this.estado.duracion && t.duracion) this.poner({ duracion: t.duracion })
        if (this.fraseObjetivo) {
          const t0 = this.inicioDeFrase(this.fraseObjetivo)
          this.fraseObjetivo = null
          if (t0 != null) this.buscar(t0)
        }
        this.actualizarFrase(true)
      })
      .catch(fallo)
  }

  /**
   * F7: la energía de la voz ahora mismo (0–1), de la envolvente precalculada en tiempos.json (contrato C7;
   * sin Web Audio, que en iOS silencia el audio en segundo plano). Null si el capítulo no la trae.
   */
  nivelVoz = (): number | null => {
    const e = this.tiempos?.envolvente
    if (!e || !(e.hz > 0) || !Array.isArray(e.v) || !e.v.length) return null
    const i = Math.floor(this.posicion() * e.hz)
    const v = e.v[Math.max(0, Math.min(e.v.length - 1, i))]
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : null
  }

  // ------------------------------------------------------------ precarga y cinta (2026-11-12)
  /** ¿Suena desde la cinta continua (y no desde una parte o el <audio> normal)? */
  private enCinta(): boolean {
    return !!this.cinta?.puesta && !!this.cinta.actual && !this.enPartes()
  }

  /** Qué archivo toca para la velocidad actual (el 2x desde 2x), a qué factor y a qué velocidad del navegador. */
  private elegirFuente(urls: { u1: string | null; u2: string | null }) {
    const plan = planDeVelocidad(this.estado.velocidad)
    let src = plan.variante === '2x' ? urls.u2 : urls.u1
    let factor = plan.factor
    let rate = plan.rate
    if (!src && plan.variante === '2x' && urls.u1) {
      // Sin variante 2x: el 1x estirado al máximo que el navegador permite.
      src = urls.u1
      factor = 1
      rate = Math.min(this.estado.velocidad, 4)
    }
    return { src, factor, rate }
  }

  /** A falta de PRECARGA_SEG para acabar, pide el capítulo siguiente (y en la cinta, lo pone detrás). */
  private precargarSiguiente() {
    const l = this.estado.libro
    if (!l || !this.urls.u1 || this.enPartes() || this.estado.temporizador?.tipo === 'capitulo') return
    if (this.paradoAlFinal || this.estado.finDelLibro) return
    const dur = this.estado.duracion
    // En segundos reales: a 5x, 45 s del libro serían 9 s (poco para bajar el capítulo con datos móviles).
    if (!(dur > 0) || dur - this.posicion() > PRECARGA_SEG * Math.max(1, this.estado.velocidad)) return
    const sig = this.vecinoConVoz(this.estado.capitulo, 1)
    if (sig < 0) return
    const clave = `${l.ejemplarId}|${this.estado.vozId}|${sig}`
    const p = this.precarga
    if (p?.clave === clave) {
      if (p.listo) this.encolarEnCinta(p)
      else if (!p.pidiendo && this.deps.ahora() - p.desde > 10_000) this.pedirPrecarga(clave, sig)
      return
    }
    this.pedirPrecarga(clave, sig)
  }

  private pedirPrecarga(clave: string, capitulo: number) {
    const l = this.estado.libro
    if (!l) return
    const vozId = this.estado.vozId
    const p: Precarga = {
      clave,
      capitulo,
      vozId,
      desde: this.deps.ahora(),
      pidiendo: true,
      listo: false,
      u1: null,
      u2: null,
      ut: null,
      duracion: 0,
      enCinta: null,
      fallos: 0,
      reintentoEn: 0,
      fallida: false,
    }
    this.precarga = p
    this.deps
      .pedirEstado({ ejemplarId: l.ejemplarId, vozId, capitulo })
      .then((r) => {
        p.pidiendo = false
        p.desde = this.deps.ahora()
        if (this.precarga !== p) return
        const e = r.correct ? r.object : null
        if (e?.estado !== 'LISTO') return // se vuelve a preguntar en 10 s (el servidor ya lo está generando)
        p.listo = true
        p.u1 = this.deps.resolverUrl(e.url1x)
        p.u2 = this.deps.resolverUrl(e.url2x)
        p.ut = this.deps.resolverUrl(e.urlTiempos)
        p.duracion = e.duracionSeg ?? 0
        this.encolarEnCinta(p)
      })
      .catch(() => {
        p.pidiendo = false
        p.desde = this.deps.ahora()
      })
  }

  /** La precarga, si es justo el capítulo que va ahora y está LISTA. */
  private precargaPara(capitulo: number): Precarga | null {
    const p = this.precarga
    const l = this.estado.libro
    // Una precarga que no se pudo poner en la cinta no vale: al acabar se pide como siempre (URL y token nuevos).
    if (!p || !l || !p.listo || !p.u1 || p.fallida) return null
    return p.capitulo === capitulo && p.vozId === this.estado.vozId && p.clave.startsWith(`${l.ejemplarId}|`) ? p : null
  }

  /** En la cinta, el capítulo siguiente se añade detrás del actual: sonará sin corte. */
  private encolarEnCinta(p: Precarga) {
    const c = this.cinta
    if (!c || !this.enCinta() || this.cargandoCinta) return
    // RP-03: tras un fallo se espera (2, 4, 8… s) y, tras varios o con 401/403/404, se deja para el final.
    if (p.fallida || this.deps.ahora() < p.reintentoEn) return
    const { src } = this.elegirFuente({ u1: p.u1, u2: p.u2 })
    if (!src) return
    const sig = c.siguienteDe(c.actual)
    if (sig?.clave === src || (p.enCinta === src && !sig)) return
    if (sig) c.olvidarSiguientes() // otra velocidad: se vuelve a poner con el archivo que toca
    p.enCinta = src
    c.encolar(src)
      .then((t) => {
        // Cancelado (se olvidó lo de detrás entre tanto): se podrá volver a poner.
        if (!t && this.precarga === p && p.enCinta === src && !c.siguienteDe(c.actual)) p.enCinta = null
      })
      .catch((e) => {
        if (p.enCinta === src) p.enCinta = null
        this.fallarPrecarga(p, clasificarFallo(e), e)
      })
  }

  /** Un fallo al poner el capítulo siguiente en la cinta: se espera más cada vez y, si no tiene arreglo, se deja. */
  private fallarPrecarga(p: Precarga, tipo: FalloCinta, e: unknown) {
    if (tipo === 'cancelada') return
    console.error('[voz] cinta: no se pudo poner el capítulo siguiente', e)
    p.fallos++
    p.reintentoEn = this.deps.ahora() + Math.min(30_000, 1_000 * 2 ** p.fallos)
    if (tipo === 'acceso' || tipo === 'plataforma' || p.fallos >= MAX_FALLOS_PRECARGA) p.fallida = true
  }

  /** Quita de la cinta lo que va detrás del capítulo actual (y, si estaba en vuelo, no llega a ponerse). */
  private olvidarSiguientesEnCinta() {
    const c = this.cinta
    if (c && this.enCinta()) c.olvidarSiguientes()
    if (this.precarga) this.precarga.enCinta = null
  }

  /**
   * Pasa al capítulo precargado AL INSTANTE, sin pedir nada al servidor. En la
   * cinta ya está sonando (solo cambia la cuenta); con el <audio> normal se
   * cambia el src y se da ▶ dentro del mismo 'ended'.
   */
  private entrarEnPrecargado(p: Precarga) {
    const turno = ++this.turno
    this.cancelarSondeo()
    this.precarga = null
    this.saltosSeguidos = 0
    this.quiereSonar = true
    this.pedido = { capitulo: p.capitulo, posicion: 0, fraseId: null }
    this.urls = { u1: p.u1, u2: p.u2 }
    this.tiempos = null
    this.tiemposPendientes = null
    this.olvidarPartes()
    this.fraseObjetivo = null
    this.palabraActual = null
    this.finAvisado = null
    this.paradoAlFinal = false
    this.fallosAcceso = 0
    this.poner({
      capitulo: p.capitulo,
      posicion: 0,
      duracion: p.duracion,
      fraseId: null,
      mensaje: null,
      tipoError: null,
      preparacion: null,
      finDelLibro: false,
    })
    const c = this.cinta
    const { src } = this.elegirFuente(this.urls)
    if (c && this.enCinta() && src && c.siguienteDe(c.actual)?.clave === src) {
      c.avanzar()
      if (this.el?.paused) this.reproducir()
    } else this.ponerFuente(0, true)
    this.leerTiempos(p.ut, turno)
    this.sesionMedios()
    this.guardar(true)
  }

  /** En la cinta: ¿llegó lo que suena al final del capítulo? Entonces, como un 'ended'. */
  private vigilarFinCinta() {
    const c = this.cinta
    const t = c?.actual
    const el = this.el
    if (!c || !t || !el || !this.enCinta() || this.cargandoCinta) return
    if ((el.currentTime || 0) < t.fin - 0.12) return
    if (this.finAvisado === t) return
    this.finAvisado = t
    this.alTerminar()
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
    this.cinta?.soltar() // las partes van por el <audio> normal; al acabar el capítulo se vuelve a la cinta
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

  /**
   * En la cinta: el archivo se trocea y se pone en ella (o, si ya es el que suena, solo se salta). Si la cinta
   * falla (navegador raro, archivo ilegible), se apaga para esta sesión y se sigue con el <audio> normal.
   */
  private ponerEnCinta(
    el: HTMLAudioElement,
    src: string,
    factor: 1 | 2,
    rate: number,
    pos1x: number,
    reproducir: boolean,
  ) {
    const c = this.cinta
    if (!c) return
    this.factor = factor
    this.rate = rate
    this.posPendiente = null
    const tArchivo = tiempoEnArchivo(pos1x, factor)
    const despues = () => {
      el.defaultPlaybackRate = rate
      el.playbackRate = rate
      ;(el as AudioExtendido).preservesPitch = true
      if (!this.estado.duracion && c.actual)
        this.poner({ duracion: tiempoEn1x(c.actual.fin - c.actual.inicio, factor) })
      if (reproducir || this.quiereSonar) this.reproducir()
      else if (this.estado.fase === 'cargando' || this.estado.fase === 'preparando')
        this.poner({ fase: 'pausado', mensaje: null, preparacion: null })
      this.sesionMedios()
    }
    if (c.puesta && c.actual?.clave === src && !this.cargandoCinta) {
      c.irA(tArchivo)
      return despues()
    }
    const turno = this.turno
    this.cargasCinta++
    this.srcCargando = src
    this.finAvisado = null
    c.cargar(src, tArchivo)
      .then(() => {
        this.cargasCinta--
        if (turno !== this.turno) return
        this.fallosCinta = 0
        this.fallosAcceso = 0
        if (this.estado.carga != null) this.poner({ carga: null })
        despues()
      })
      .catch((e) => {
        this.cargasCinta--
        const tipo = clasificarFallo(e)
        if (tipo === 'cancelada' || turno !== this.turno) return
        this.fallarCinta(tipo, e, pos1x, reproducir || this.quiereSonar)
      })
  }

  /**
   * La cinta no pudo poner el capítulo (RP-04). Un corte de red o un 5xx no la
   * apagan: se dice y se reintenta solo. Un 401/403/404 (token caducado, audio
   * regenerado) se vuelve a pedir una vez al servidor. Solo un fallo de la
   * plataforma repetido la apaga para la sesión, y se avisa.
   */
  private fallarCinta(tipo: FalloCinta, e: unknown, pos1x: number, reproducir: boolean) {
    if (this.estado.carga != null) this.poner({ carga: null })
    const capitulo = this.pedido?.capitulo ?? this.estado.capitulo
    this.pedido = { capitulo, posicion: pos1x, fraseId: null }
    if (tipo === 'red' || tipo === 'servidor') {
      console.warn('[voz] cinta: sin red al bajar el capítulo; se reintentará', e)
      this.fallar('red', TEXTOS_VOZ.sinRedReintentando)
      this.programarReintento()
      return
    }
    if (tipo === 'acceso') {
      console.warn('[voz] cinta: el audio no se pudo bajar (acceso)', e)
      if (this.fallosAcceso++ < 1) {
        // Se vuelve a preguntar al servidor: trae la URL con un token nuevo.
        this.cargar(capitulo, pos1x, reproducir, null, false, true)
        return
      }
      this.fallar('audio', TEXTOS_VOZ.audioFallo)
      return
    }
    console.error('[voz] la cinta falló', e)
    this.cinta?.soltar()
    this.fallosCinta++
    if (this.fallosCinta >= MAX_FALLOS_CINTA) {
      // Ya no es un tropiezo: el resto de la sesión, con el <audio> normal; y se dice por qué.
      this.cinta = null
      this.poner({ escuchaContinua: 'apagada' })
    }
    this.ponerFuente(pos1x, reproducir)
  }

  /** F6: cuánto ha bajado el capítulo que se está poniendo en la cinta. */
  private alProgresarCinta(url: string, f: number) {
    if (!this.cargandoCinta || url !== this.srcCargando) return
    const antes = this.estado.carga
    if (antes == null || f >= 1 || Math.abs(f - antes) >= 0.02) this.poner({ carga: f })
  }

  /** RP-08: el navegador cerró la cinta (iOS bajo presión): se rehace en la misma posición. */
  private rehacerCinta() {
    if (!this.estado.libro || !this.urls.u1 || this.enPartes() || !this.cinta) return
    const sonar = this.quiereSonar
    this.ponerFuente(this.estado.posicion, sonar)
  }

  /** Una descarga que ya sonaba se cortó a medias (RP-07): el capítulo actual se rehace; el siguiente, se olvida. */
  private alFallarDescarga(url: string, e: unknown) {
    const c = this.cinta
    if (!c) return
    console.warn('[voz] cinta: la descarga se cortó a medias', e)
    if (c.actual?.clave === url && !this.cargandoCinta) {
      // Lo que falta no llegará: se rehace la cinta desde donde va (si sigue sin red, el reintento de siempre).
      const pos = this.posicion()
      c.soltar()
      return this.ponerFuente(pos, this.quiereSonar)
    }
    if (c.siguienteDe(c.actual)?.clave === url) {
      this.olvidarSiguientesEnCinta()
      const p = this.precarga
      if (p) this.fallarPrecarga(p, clasificarFallo(e), e)
    }
  }

  /** Pone en el <audio> el archivo que toca para la velocidad actual, conservando la posición. */
  private ponerFuente(pos1x: number, reproducir: boolean) {
    const el = this.audio()
    if (!el) return
    const { src, factor, rate } = this.elegirFuente(this.urls)
    if (!src) return
    if (this.cinta && !this.enPartes()) return this.ponerEnCinta(el, src, factor, rate, pos1x, reproducir)
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
    if (!this.estado.duracion && Number.isFinite(el.duration) && !this.enPartes() && !this.cinta?.puesta)
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
    if (this.paradoAlFinal) {
      // RP-01: el temporizador paró al final del capítulo; ▶ sigue con el siguiente (no relee este).
      this.paradoAlFinal = false
      const sig = this.vecinoConVoz(this.estado.capitulo, 1)
      if (sig >= 0) {
        const pre = this.precargaPara(sig)
        if (pre) return this.entrarEnPrecargado(pre)
        this.saltosSeguidos = 0
        void this.cargar(sig, 0, true, null, false, true)
        return
      }
      this.poner({ finDelLibro: true })
    }
    if (this.estado.finDelLibro) {
      // RP-02: al final del libro, ▶ vuelve a oír el último capítulo desde el principio (nunca «Pausar» mudo).
      this.poner({ finDelLibro: false, mensaje: null })
      this.buscar(0)
    }
    if (!this.hayAudio()) return // aún preparando: sonará en cuanto esté
    if (this.cargandoCinta) return // sonará en cuanto la cinta tenga el capítulo
    if (this.esperandoParte) return // sonará en cuanto llegue la siguiente parte
    if (this.ultimaPausa && this.deps.ahora() - this.ultimaPausa > PAUSA_LARGA_MS && this.tiempos) {
      // Tras una pausa larga se vuelve una frase atrás, para retomar el hilo.
      const i = buscarFrase(this.tiempos.frases, this.posicion())
      const anterior = this.tiempos.frases[Math.max(0, i - 1)]
      if (anterior) this.buscar(anterior.t0)
    }
    this.ultimaPausa = 0
    // RP-17: si el <audio> ya estaba en marcha (la cinta sigue «sonando» mientras llega el capítulo siguiente),
    // play() no dispara 'play': sin esto el reproductor se quedaría en «cargando» con la voz sonando.
    const yaSonaba = !el.paused && el.src !== SILENCIO
    const p = el.play()
    if (p && typeof p.catch === 'function') {
      p.catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name === 'NotAllowedError')
          this.poner({ fase: 'pausado', mensaje: MENSAJES.vozToqueParaEmpezar })
      })
    }
    if (yaSonaba && this.estado.fase !== 'reproduciendo') this.alEmpezarASonar()
  }

  /** Empieza a sonar de verdad: fase, palabra a 60 fps, pantalla de bloqueo, temporizador y sesión de escucha. */
  private alEmpezarASonar() {
    this.poner({ fase: 'reproduciendo', mensaje: null, tipoError: null, preparacion: null, finDelLibro: false })
    this.reanudarTemporizador()
    this.empezarSesionVoz()
    this.arrancarRaf()
    this.sesionMedios()
  }

  /** Volver al principio del libro (el primer capítulo con voz). */
  volverAEmpezar() {
    const l = this.estado.libro
    if (!l) return
    const caps = l.capitulos
    const primero = caps.length ? vecinoConVoz(caps, caps[0].indice - 1, 1) : -1
    void this.cargar(primero >= 0 ? primero : (caps[0]?.indice ?? 0), 0, true)
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
    if (this.cargandoCinta) return this.estado.posicion
    if (this.enCinta()) return tiempoEn1x(this.cinta?.tiempo() ?? 0, this.factor)
    const parte = this.enPartes() ? this.partes?.m.partes[this.parteActual] : null
    if (parte) return parte.t0 + (el.currentTime || 0)
    return tiempoEn1x(el.currentTime || 0, this.factor)
  }

  buscar(pos1x: number) {
    const el = this.el
    const max = this.estado.duracion || Number.MAX_SAFE_INTEGER
    let p = Math.max(0, Math.min(max - 0.05, pos1x))
    // Moverse dentro del capítulo deshace el «parado al final» y el fin del libro: ▶ sigue desde aquí.
    this.paradoAlFinal = false
    this.finAvisado = null
    if (this.estado.finDelLibro) this.poner({ finDelLibro: false })
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
      if (this.enCinta()) this.cinta?.irA(tiempoEnArchivo(p, this.factor))
      else if (this.posPendiente != null) this.posPendiente = p
      else el.currentTime = tiempoEnArchivo(p, this.factor)
    }
    this.poner({ posicion: p })
    this.actualizarFrase(true)
    this.posicionSesion()
  }

  saltar(segundos: number) {
    const destino = this.posicion() + segundos
    const dur = this.estado.duracion
    // RP-10: «+15 s» a pocos segundos del final sigue en el capítulo siguiente si ya está precargado.
    if (segundos > 0 && dur > 0 && destino > dur - 0.05 && this.seguirSonando()) {
      const sig = this.vecinoConVoz(this.estado.capitulo, 1)
      const pre = sig >= 0 && this.estado.temporizador?.tipo !== 'capitulo' ? this.precargaPara(sig) : null
      if (pre) {
        this.entrarEnPrecargado(pre)
        this.buscar(Math.max(0, destino - dur))
        return
      }
    }
    this.buscar(destino)
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
    if (t === 'capitulo') {
      // En la cinta, lo de detrás se quita: la voz no debe colarse en el capítulo siguiente al parar (RP-01).
      this.olvidarSiguientesEnCinta()
      return this.poner({ temporizador: { tipo: 'capitulo' } })
    }
    const ms = t.minutos * 60_000
    // Puesto en pausa, empieza a contar al sonar (RP-14).
    const sonando = this.estado.fase === 'reproduciendo'
    this.poner({
      temporizador: {
        tipo: 'minutos',
        minutos: t.minutos,
        finEn: this.deps.ahora() + ms,
        ...(sonando ? {} : { pausadoCon: ms }),
      },
    })
  }

  /** RP-14: el temporizador por minutos no cuenta con la voz en pausa. */
  private pausarTemporizador() {
    const t = this.estado.temporizador
    if (t?.tipo !== 'minutos' || t.pausadoCon != null) return
    if (this.el) this.el.volume = 1
    this.poner({ temporizador: { ...t, pausadoCon: Math.max(0, t.finEn - this.deps.ahora()) } })
  }

  private reanudarTemporizador() {
    const t = this.estado.temporizador
    if (t?.tipo !== 'minutos' || t.pausadoCon == null) return
    this.poner({ temporizador: { tipo: 'minutos', minutos: t.minutos, finEn: this.deps.ahora() + t.pausadoCon } })
  }

  private revisarTemporizador() {
    const t = this.estado.temporizador
    const el = this.el
    if (!t || t.tipo !== 'minutos' || !el || t.pausadoCon != null) return
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
    if (!this.tiempos && this.tiemposPendientes) this.pedirTiempos()
    this.revisarTemporizador()
    this.precargarSiguiente()
    if (this.enCinta()) {
      this.cinta?.bomba()
      this.vigilarFinCinta()
    }
    const ahora = this.deps.ahora()
    if (!el.paused) this.contarEscucha(ahora)
    if (ahora - this.ultimoLocal >= CADA_LOCAL_MS) this.guardar(false)
    if (ahora - this.ultimoServidor >= CADA_SERVIDOR_MS) this.guardar(true)
  }

  private alTerminar = () => {
    const l = this.estado.libro
    if (!l || !this.hayAudio()) return
    // RP-16: el 'ended' del silencio de desbloqueo (o uno que llega mientras la cinta aún baja el capítulo)
    // no es el final del capítulo pedido.
    if (this.el?.src === SILENCIO || this.cargandoCinta) return
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
    const sig = this.vecinoConVoz(this.estado.capitulo, 1)
    if (this.estado.temporizador?.tipo === 'capitulo') {
      this.quiereSonar = false
      // RP-01: ▶ seguirá con el siguiente (no relee este ni deja la cuenta atrás en la cinta).
      this.paradoAlFinal = true
      this.el?.pause() // en la cinta el audio seguiría con el capítulo siguiente
      this.olvidarSiguientesEnCinta()
      const titulo = sig >= 0 ? l.capitulos.find((c) => c.indice === sig)?.titulo : null
      this.poner({
        temporizador: null,
        fase: 'pausado',
        mensaje: titulo ? TEXTOS_VOZ.finCapituloSigue(titulo) : MENSAJES.vozFinCapitulo,
      })
      this.guardar(true)
      return
    }
    const pre = sig >= 0 ? this.precargaPara(sig) : null
    if (pre) return this.entrarEnPrecargado(pre)
    if (sig >= 0) {
      // Mismo elemento, nuevo src: así iOS sigue sonando con la pantalla bloqueada.
      this.saltosSeguidos = 0
      this.cargar(sig, 0, true, null, false, true)
    } else {
      this.quiereSonar = false
      this.el?.pause()
      this.poner({ fase: 'pausado', mensaje: TEXTOS_VOZ.finLibro, finDelLibro: true })
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
      const libro = p.ejemplarId
      // F10: el sello «Guardado en casa · 10:42» o «se guardará al volver la red» dice lo que pasó de verdad.
      Promise.resolve(this.deps.guardarServidor(p))
        .then((r) => {
          if (this.estado.libro?.ejemplarId !== libro) return
          const rechazado = (r as { correct?: unknown } | null)?.correct === false
          this.poner({ guardado: { estado: rechazado ? 'pendiente' : 'ok', en: this.deps.ahora() } })
        })
        .catch((e) => {
          console.error('[voz] no se pudo guardar el progreso', e)
          if (this.estado.libro?.ejemplarId === libro) this.poner({ guardado: { estado: 'pendiente', en: ahora } })
        })
    }
  }

  // ------------------------------------------------------------ sesión de escucha (C4)
  /** Al empezar a sonar: la sesión sigue (o empieza una nueva si es otro libro o pasó mucho rato). */
  private empezarSesionVoz() {
    const l = this.estado.libro
    if (!l || !this.deps.latido) return
    const ahora = this.deps.ahora()
    const s = this.sesionVoz
    if (!s || s.ejemplarId !== l.ejemplarId || ahora - s.ultimaVez > SESION_NUEVA_MS) {
      if (s && s.acumulado >= 1) this.latir(true)
      this.sesionVoz = {
        id: (this.deps.nuevoId ?? uuid)(),
        ejemplarId: l.ejemplarId,
        acumulado: 0,
        ultimoTick: ahora,
        ultimoEnvio: ahora,
        ultimaVez: ahora,
      }
      return
    }
    s.ultimoTick = ahora
    s.ultimaVez = ahora
  }

  /** Cuenta el tiempo que de verdad suena (entre timeupdates) y, cada minuto, manda el latido. */
  private contarEscucha(ahora: number) {
    const s = this.sesionVoz
    if (!s || this.estado.fase !== 'reproduciendo' || s.ejemplarId !== this.estado.libro?.ejemplarId) return
    if (s.ultimoTick != null) s.acumulado += Math.max(0, Math.min(ahora - s.ultimoTick, TICK_MAX_MS)) / 1000
    s.ultimoTick = ahora
    s.ultimaVez = ahora
    if (ahora - s.ultimoEnvio >= LATIDO_MS) this.latir(false)
  }

  /**
   * Manda el latido con lo escuchado desde el anterior (0–120 s). `cerrar`: al pausar, salir o cambiar de libro
   * (se cuenta hasta ahora y se deja de contar hasta que vuelva a sonar).
   */
  latir(cerrar = false) {
    const s = this.sesionVoz
    const enviar = this.deps.latido
    if (!s || !enviar) return
    const ahora = this.deps.ahora()
    if (cerrar && s.ultimoTick != null) {
      s.acumulado += Math.max(0, Math.min(ahora - s.ultimoTick, TICK_MAX_MS)) / 1000
      s.ultimoTick = null
    }
    s.ultimoEnvio = ahora
    const segundos = Math.min(LATIDO_MAX_SEG, Math.round(s.acumulado))
    if (segundos < 1) return
    s.acumulado = Math.max(0, s.acumulado - segundos)
    const enEsteLibro = this.estado.libro?.ejemplarId === s.ejemplarId
    const d: LatidoVoz = {
      ejemplarId: s.ejemplarId,
      modo: 'VOZ',
      sesionId: s.id,
      capitulo: enEsteLibro ? this.estado.capitulo : 0,
      posicion: enEsteLibro ? Number(acotar(this.posicion(), 0, Number.MAX_SAFE_INTEGER, 0).toFixed(2)) : 0,
      segundos,
      dispositivo: this.deps.dispositivo(),
    }
    Promise.resolve()
      .then(() => enviar(d))
      .catch((e) => {
        // Sin red: lo escuchado no se pierde, va en el siguiente latido (sin pasar del máximo).
        console.warn('[voz] latido de sesión', e)
        if (this.sesionVoz === s) s.acumulado = Math.min(LATIDO_MAX_SEG, s.acumulado + segundos)
      })
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
    // Con la sesión caducada el latido daría 401: lo escuchado se pierde (es solo estadística).
    if (o.servidor ?? true) this.latir(true)
    this.sesionVoz = null
    this.quiereSonar = false
    this.paradoAlFinal = false
    this.tiemposPendientes = null
    this.pedido = null
    // Sin URLs antes de pausar: el 'pause' ya no guarda (con la sesión caducada daría 401).
    this.urls = { u1: null, u2: null }
    this.olvidarPartes()
    this.sondearYa = null
    this.tiempos = null
    this.precarga = null
    this.el?.pause()
    this.cinta?.soltar()
    this.poner({ ...inicial, escuchaContinua: this.cinta ? 'activa' : this.estado.escuchaContinua })
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
