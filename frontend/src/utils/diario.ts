import { enviarDiario, enviarDiarioAlSalir } from '@servicios/diarioService'

/*
 * EL DIARIO DEL REPRODUCTOR (0.5.0, contrato C9). Telemetría PROPIA: nunca sale de casa.
 *
 * Por qué: «se corta el sonido y no sigue», «pausas extrañas», «al cambiar de capítulo
 * no lo toma»… pasan en el iPhone de Anderson y no hay logs de cliente. El motor de la
 * voz anota aquí lo que le pasa (inicio, pausas, atascos, fallos de la cinta, cambios de
 * capítulo, si la página se ve o no, si hay red) y esto lo sube a `POST /v1/diario`.
 *
 * REGLA DE ORO: el diario nunca puede romper ni frenar la reproducción.
 *   · `anotarDiario` es síncrono, no espera nada y no lanza nunca (try/catch);
 *   · se guarda en memoria y, sin prisa (1 s después), en localStorage;
 *   · se manda en lotes de ≤ 50 cada ~30 s, al ocultarse la página (fetch keepalive)
 *     y al volver la red; un envío que falla se reintenta en el siguiente turno;
 *   · tope de eventos guardados y por hora: un bucle de fallos no llena el teléfono.
 *
 * La lógica vive en `Diario` con todo inyectable (reloj, almacén, envío, temporizador),
 * y se prueba sola; el diario por defecto se conecta a la página solo en el navegador
 * (nunca en las pruebas ni en nativo).
 */

/** La versión de la web que anota (va en cada evento). */
export const VERSION_APP = '0.5.0'

/** Tipos que manda la web (lista abierta, contrato C9). */
export type TipoDiario =
  | 'inicio'
  | 'pausa-usuario'
  | 'pausa-sistema'
  | 'reanuda'
  | 'atasco'
  | 'atasco-recuperado'
  | 'espera-larga'
  | 'error-audio'
  | 'error-red'
  | 'cinta-fallo'
  | 'cinta-apagada'
  | 'cambio-capitulo'
  | 'fin-capitulo'
  | 'fin-libro'
  | 'oculta'
  | 'visible'
  | 'interrupcion'
  | 'sin-conexion-uso'
  | 'descarga-error'
  | (string & Record<never, never>)

export interface ContextoDiario {
  /** Abierta como app instalada (pantalla de inicio), no en una pestaña. */
  standalone: boolean
  /** Suena por la cinta continua (ManagedMediaSource). */
  cinta: boolean
  /** La página se ve (no está bloqueado el teléfono ni en otra app). */
  visible: boolean
  /** El navegador cree que hay red. */
  red: boolean
  /** Navegador y sistema, en corto («iPhone iOS 18.1 Safari 18.1»). */
  ua: string
  version: string
  /** El paquete de la web (hash del bundle), si se sabe. */
  build?: string
}

/** Lo que se manda (contrato C9). */
export interface EventoDiario {
  cuando: string
  tipo: string
  ejemplarId: string | null
  capitulo: number | null
  posicion: number | null
  detalle: string | null
  contexto: ContextoDiario
}

/** Lo que anota quien llama (el motor): todo opcional menos el tipo. */
export interface DatosDiario {
  ejemplarId?: string | null
  capitulo?: number | null
  posicion?: number | null
  detalle?: string | null
  cinta?: boolean
}

/** Qué pasó al mandar un lote. */
export type ResultadoEnvio =
  /** Guardado: se quita de la cola. */
  | 'ok'
  /** Sin red, 5xx o 401 pasajero: se queda y se reintenta. */
  | 'reintentar'
  /** El servidor no lo quiere (400): se tira, reintentarlo daría lo mismo. */
  | 'descartar'
  /** El servidor no tiene la ruta (una 0.4.0): se deja de mandar hasta recargar. */
  | 'sin-ruta'

export interface AlmacenDiario {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export interface EntornoDiario {
  ahora: () => number
  almacen: AlmacenDiario | null
  enviar: (eventos: EventoDiario[]) => Promise<ResultadoEnvio>
  /** Envío que sobrevive a la página (fetch keepalive). Resuelve true si llegó (si la página sigue viva para saberlo). */
  enviarAlSalir: (eventos: EventoDiario[]) => Promise<boolean>
  contexto: () => Omit<ContextoDiario, 'cinta'>
  /** Programa `fn` dentro de `ms`; devuelve cómo cancelarlo. */
  programar: (fn: () => void, ms: number) => () => void
}

export const CLAVE_DIARIO = 'bah.diario'
/** Eventos por lote (el servidor rechaza más de 50). */
export const LOTE_MAX = 50
/** Cada cuánto se manda lo pendiente. */
export const CADA_ENVIO_MS = 30_000
/** Tope de eventos guardados sin mandar (se tiran los más viejos). */
export const COLA_MAX = 400
/** Tope de eventos anotados por hora (el servidor guarda 600; un bucle de fallos no debe llenar nada). */
export const MAX_POR_HORA = 300
/** El mismo evento (tipo y detalle) repetido en este rato no se vuelve a anotar. */
export const REPETIDO_MS = 2_000
/** Lotes como mucho por vaciado (para no ocupar la red de golpe). */
const LOTES_POR_VEZ = 4
/** Lo que cabe en un fetch keepalive (64 KB) con margen. */
const BYTES_AL_SALIR = 56_000
const GUARDAR_TRAS_MS = 1_000

const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

/** `[a-z0-9-]`, ≤ 40 (contrato C9). */
export function limpiarTipo(tipo: string): string {
  const t = String(tipo ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return recortar(t || 'otro', 40)
}

/** Navegador y sistema en corto: «iPhone iOS 18.1 Safari 18.1», «Android 14 Chrome 131», «Windows Chrome 131». */
export function uaCorto(ua: string): string {
  if (!ua) return ''
  const partes: string[] = []
  const ios = /\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/.exec(ua)
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua)
  if (ios) partes.push(ios[1], `iOS ${ios[2]}.${ios[3]}`)
  else if (android) partes.push(`Android ${android[1]}`)
  else if (/Macintosh/.test(ua)) partes.push('Mac')
  else if (/Windows/.test(ua)) partes.push('Windows')
  else if (/Linux/.test(ua)) partes.push('Linux')
  // El primero que aparezca de esta lista (Edge y Chrome de iOS también dicen «Chrome»/«Safari»).
  let nav: string | null = null
  for (const n of ['CriOS', 'FxiOS', 'EdgiOS', 'EdgA', 'Edg', 'OPR', 'SamsungBrowser', 'Firefox', 'Chrome']) {
    const m = new RegExp(`\\b${n}/(\\d+)`).exec(ua)
    if (m) {
      nav = `${n} ${m[1]}`
      break
    }
  }
  const safari = nav ? null : /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua)
  if (nav) partes.push(nav)
  else if (safari) partes.push(`Safari ${safari[1]}`)
  const r = partes.join(' ')
  return recortar(r || ua, 200)
}

const numero = (n: unknown, decimales: number): number | null => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

export class Diario {
  private cola: EventoDiario[] = []
  private enviando = false
  private sinRuta = false
  private cancelarEnvio: (() => void) | null = null
  private cancelarGuardado: (() => void) | null = null
  private hora = { desde: 0, n: 0 }
  private ultimo: { clave: string; en: number } | null = null

  constructor(private e: EntornoDiario) {
    try {
      const g = e.almacen?.getItem(CLAVE_DIARIO)
      const leidos = g ? (JSON.parse(g) as unknown) : null
      if (Array.isArray(leidos)) this.cola = leidos.filter((x) => x && typeof x.tipo === 'string').slice(-COLA_MAX)
    } catch {
      /* almacén ilegible: se empieza de cero */
    }
    if (this.cola.length) this.programarEnvio()
  }

  /** Lo que queda por mandar (para las pruebas y para «Ajustes»). */
  pendientes(): readonly EventoDiario[] {
    return this.cola
  }

  /** Anota un evento. Síncrono, barato y sin lanzar nunca. */
  anotar(tipo: TipoDiario, d: DatosDiario = {}): void {
    try {
      const ahora = this.e.ahora()
      const t = limpiarTipo(tipo)
      const detalle = d.detalle == null ? null : recortar(String(d.detalle), 500)
      const clave = `${t}|${detalle ?? ''}`
      if (this.ultimo && this.ultimo.clave === clave && ahora - this.ultimo.en < REPETIDO_MS) return
      this.ultimo = { clave, en: ahora }
      if (ahora - this.hora.desde >= 3_600_000) this.hora = { desde: ahora, n: 0 }
      if (++this.hora.n > MAX_POR_HORA) return
      const ctx = this.e.contexto()
      this.cola.push({
        cuando: new Date(ahora).toISOString(),
        tipo: t,
        ejemplarId: d.ejemplarId ?? null,
        capitulo: d.capitulo == null || !Number.isFinite(d.capitulo) ? null : Math.trunc(d.capitulo),
        posicion: numero(d.posicion, 1),
        detalle,
        contexto: { ...ctx, ua: recortar(ctx.ua ?? '', 200), cinta: !!d.cinta },
      })
      if (this.cola.length > COLA_MAX) this.cola.splice(0, this.cola.length - COLA_MAX)
      this.programarGuardado()
      this.programarEnvio()
    } catch {
      /* el diario nunca molesta */
    }
  }

  private programarGuardado() {
    if (this.cancelarGuardado || !this.e.almacen) return
    this.cancelarGuardado = this.e.programar(() => {
      this.cancelarGuardado = null
      this.guardar()
    }, GUARDAR_TRAS_MS)
  }

  private guardar() {
    try {
      this.e.almacen?.setItem(CLAVE_DIARIO, JSON.stringify(this.cola))
    } catch {
      /* sin espacio: queda en memoria */
    }
  }

  private programarEnvio() {
    if (this.cancelarEnvio || this.sinRuta || !this.cola.length) return
    this.cancelarEnvio = this.e.programar(() => {
      this.cancelarEnvio = null
      void this.vaciar()
    }, CADA_ENVIO_MS)
  }

  /** Manda lo pendiente en lotes de ≤ 50. Nunca lanza. */
  async vaciar(): Promise<void> {
    if (this.enviando || this.sinRuta) return
    this.enviando = true
    try {
      for (let i = 0; i < LOTES_POR_VEZ && this.cola.length; i++) {
        const lote = this.cola.slice(0, LOTE_MAX)
        let r: ResultadoEnvio
        try {
          r = await this.e.enviar(lote)
        } catch {
          r = 'reintentar'
        }
        if (r === 'reintentar') break
        if (r === 'sin-ruta') {
          this.sinRuta = true
          break
        }
        // 'ok' o 'descartar': ese lote ya no se manda.
        this.cola = this.cola.filter((x) => !lote.includes(x))
      }
      this.guardar()
    } finally {
      this.enviando = false
      if (this.cancelarEnvio) {
        this.cancelarEnvio()
        this.cancelarEnvio = null
      }
      this.programarEnvio()
    }
  }

  /**
   * La página se oculta (teléfono bloqueado, otra app): lo pendiente sale YA por keepalive (lo que quepa). Se quita
   * de la cola al mandarlo y vuelve a ella si el envío falla (si la página muere antes de saberlo, se pierde: es solo
   * telemetría, mejor eso que duplicarlo).
   */
  alOcultarse(hayRed: boolean): void {
    try {
      this.guardar()
      if (!hayRed || this.sinRuta || !this.cola.length || this.enviando) return
      const lote: EventoDiario[] = []
      let bytes = 20
      for (const ev of this.cola) {
        const b = JSON.stringify(ev).length + 1
        if (lote.length >= LOTE_MAX || bytes + b > BYTES_AL_SALIR) break
        lote.push(ev)
        bytes += b
      }
      if (!lote.length) return
      this.cola = this.cola.filter((x) => !lote.includes(x))
      this.guardar()
      this.e
        .enviarAlSalir(lote)
        .then((ok) => {
          if (!ok) this.devolver(lote)
        })
        .catch(() => this.devolver(lote))
    } catch {
      /* nada */
    }
  }

  private devolver(lote: EventoDiario[]) {
    this.cola = [...lote, ...this.cola].slice(-COLA_MAX)
    this.guardar()
    this.programarEnvio()
  }
}

// ------------------------------------------------------------------ el diario de la página

type Global = typeof globalThis & {
  __bahSW?: string
  navigator?: Navigator & { standalone?: boolean }
  matchMedia?: (q: string) => { matches: boolean }
  process?: { env?: Record<string, string | undefined> }
}

const g = (): Global => globalThis as Global

/** En las pruebas (jest) el diario por defecto no se conecta a nada. */
function enPruebas(): boolean {
  try {
    return !!g().process?.env?.JEST_WORKER_ID
  } catch {
    return false
  }
}

function esNavegador(): boolean {
  const w = g() as Global & { document?: Document; addEventListener?: unknown }
  return typeof w.document !== 'undefined' && typeof w.addEventListener === 'function' && !enPruebas()
}

/** El contexto de ahora mismo (barato: sin nada asíncrono). */
export function contextoNavegador(): Omit<ContextoDiario, 'cinta'> {
  const w = g()
  const nav = w.navigator
  let standalone = false
  try {
    standalone = !!nav?.standalone || !!w.matchMedia?.('(display-mode: standalone)').matches
  } catch {
    /* nada */
  }
  const doc = (w as { document?: Document }).document
  return {
    standalone,
    visible: !doc || doc.visibilityState !== 'hidden',
    red: nav?.onLine !== false,
    ua: uaCorto(nav?.userAgent ?? ''),
    version: VERSION_APP,
    ...(w.__bahSW ? { build: String(w.__bahSW).slice(0, 20) } : {}),
  }
}

let porDefecto: Diario | null = null

function crearPorDefecto(): Diario {
  if (!esNavegador()) {
    // Fuera del navegador (pruebas, nativo): se anota en memoria y no se manda nada.
    return new Diario({
      ahora: () => Date.now(),
      almacen: null,
      enviar: async () => 'reintentar',
      enviarAlSalir: async () => false,
      contexto: contextoNavegador,
      programar: () => () => {},
    })
  }
  let almacen: AlmacenDiario | null = null
  try {
    almacen = (g() as { localStorage?: Storage }).localStorage ?? null
  } catch {
    almacen = null
  }
  const d = new Diario({
    ahora: () => Date.now(),
    almacen,
    enviar: enviarDiario,
    enviarAlSalir: enviarDiarioAlSalir,
    contexto: contextoNavegador,
    programar: (fn, ms) => {
      const t = setTimeout(fn, ms)
      return () => clearTimeout(t)
    },
  })
  try {
    const doc = (g() as { document?: Document }).document
    doc?.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') d.alOcultarse(g().navigator?.onLine !== false)
    })
    g().addEventListener?.('pagehide', () => d.alOcultarse(g().navigator?.onLine !== false))
    g().addEventListener?.('online', () => void d.vaciar())
  } catch {
    /* sin eventos: solo el envío periódico */
  }
  return d
}

/** El diario de esta página (se crea al primer uso). */
export function diario(): Diario {
  if (!porDefecto) porDefecto = crearPorDefecto()
  return porDefecto
}

/** Anota en el diario de la página. Nunca lanza ni espera: se puede llamar desde cualquier evento del audio. */
export function anotarDiario(tipo: TipoDiario, d?: DatosDiario): void {
  try {
    diario().anotar(tipo, d)
  } catch {
    /* nunca */
  }
}
