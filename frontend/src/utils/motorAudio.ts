import { buscarFrase, buscarPalabra, capituloDeFrase, indiceDeFrase, inicioFraseSiguiente } from '@logica/tiempos'
import { normalizarVelocidad, planDeVelocidad, resaltaPalabra, tiempoEn1x, tiempoEnArchivo } from '@logica/velocidad'
import type { CapituloResumen, EstadoAudioDTO, ProgresoDTO, ResultDTO, TiemposCapitulo } from '@tipos'
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

export interface LibroEnVoz {
  ejemplarId: string
  titulo: string
  autores: string[]
  portadaUrl: string | null
  capitulos: CapituloResumen[]
}

export type Temporizador = { tipo: 'minutos'; minutos: number; finEn: number } | { tipo: 'capitulo' } | null

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
}

export interface EventoFrase {
  ejemplarId: string
  fraseId: string | null
  /** [inicioChar, finChar] de la palabra que suena dentro de la frase, o null. */
  palabra: [number, number] | null
}

export interface DependenciasMotor {
  crearAudio: () => HTMLAudioElement | null
  pedirEstado: (d: { ejemplarId: string; vozId: string; capitulo: number }) => Promise<ResultDTO<EstadoAudioDTO>>
  cargarTiempos: (url: string) => Promise<TiemposCapitulo | null>
  guardarServidor: (p: ProgresoDTO) => Promise<unknown>
  guardarLocal: (p: ProgresoDTO) => Promise<unknown>
  resolverUrl: (ruta: string | null) => string | null
  dispositivo: () => string
  ahora: () => number
}

/** Silencio WAV de 0,1 s: lo que suena en el primer toque para "desbloquear" el <audio> en iOS. */
export const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

const SALTO_SEG = 15
const PAUSA_LARGA_MS = 5 * 60 * 1000
const FUNDIDO_MS = 10_000
const CADA_LOCAL_MS = 5_000
const CADA_SERVIDOR_MS = 15_000
const SONDEO_MS = 3_000

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
  private sondeo: ReturnType<typeof setTimeout> | null = null
  private ultimaPausa = 0
  private ultimoLocal = 0
  private ultimoServidor = 0
  private ultimaPosSesion = 0
  private palabraActual: [number, number] | null = null
  private raf: number | null = null
  private fraseObjetivo: string | null = null
  private posPendiente: number | null = null

  constructor(private deps: DependenciasMotor) {}

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
      this.poner({ fase: 'reproduciendo', mensaje: null })
      this.arrancarRaf()
      this.sesionMedios()
    })
    el.addEventListener('pause', () => {
      if (this.estado.fase === 'reproduciendo') this.poner({ fase: 'pausado' })
      this.ultimaPausa = this.deps.ahora()
      this.guardar(true)
      this.estadoSesion('paused')
    })
    el.addEventListener('loadedmetadata', this.alCargarMetadatos)
    el.addEventListener('error', () => {
      if (el.src && el.src !== SILENCIO && this.estado.libro) {
        this.poner({ fase: 'error', mensaje: MENSAJES.vozAudioFallo })
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
      this.urls.u1
    this.poner({
      libro,
      vozId: o.vozId,
      nombreVoz: o.nombreVoz ?? this.estado.nombreVoz,
      velocidad: normalizarVelocidad(o.velocidad),
    })
    if (mismo) {
      if (o.fraseId) this.irAFrase(o.fraseId, o.reproducir ?? true)
      else if (o.posicion != null) this.buscar(o.posicion)
      if (o.reproducir ?? true) this.reproducir()
      return
    }
    this.cargar(o.capitulo, o.posicion ?? 0, o.reproducir ?? true, o.fraseId ?? null)
  }

  private cancelarSondeo() {
    if (this.sondeo) clearTimeout(this.sondeo)
    this.sondeo = null
  }

  private async cargar(capitulo: number, posicion: number, reproducir: boolean, fraseId: string | null = null) {
    const l = this.estado.libro
    if (!l) return
    const turno = ++this.turno
    this.cancelarSondeo()
    this.tiempos = null
    this.urls = { u1: null, u2: null }
    this.fraseObjetivo = fraseId
    this.palabraActual = null
    this.poner({
      capitulo,
      posicion,
      duracion: 0,
      fraseId: fraseId,
      fase: 'cargando',
      mensaje: null,
    })
    this.el?.pause()
    const pedir = async (): Promise<void> => {
      if (turno !== this.turno) return
      let r: ResultDTO<EstadoAudioDTO>
      try {
        r = await this.deps.pedirEstado({ ejemplarId: l.ejemplarId, vozId: this.estado.vozId, capitulo })
      } catch {
        if (turno !== this.turno) return
        this.poner({ fase: 'error', mensaje: MENSAJES.sinConexion })
        return
      }
      if (turno !== this.turno) return
      if (!r.correct || !r.object) {
        this.poner({ fase: 'error', mensaje: r.message || MENSAJES.vozFallo })
        return
      }
      const e = r.object
      if (e.estado === 'LISTO') {
        this.urls = { u1: this.deps.resolverUrl(e.url1x), u2: this.deps.resolverUrl(e.url2x) }
        if (e.duracionSeg) this.poner({ duracion: e.duracionSeg })
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
        this.ponerFuente(posicion, reproducir)
        return
      }
      if (e.estado === 'ERROR' || e.estado === 'ERROR_CONVERSION') {
        this.poner({
          fase: 'error',
          mensaje: e.estado === 'ERROR' ? MENSAJES.vozFallo : MENSAJES.libroNoConvertido,
        })
        return
      }
      this.poner({
        fase: 'preparando',
        mensaje:
          e.estado === 'CONVIRTIENDO' ? MENSAJES.libroConvirtiendo : MENSAJES.vozPreparando(this.estado.nombreVoz),
      })
      this.sondeo = setTimeout(pedir, SONDEO_MS)
    }
    await pedir()
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
    else if (this.estado.fase === 'cargando' || this.estado.fase === 'preparando') this.poner({ fase: 'pausado' })
    this.sesionMedios()
  }

  private alCargarMetadatos = () => {
    const el = this.el
    if (!el) return
    if (this.posPendiente != null) {
      try {
        el.currentTime = tiempoEnArchivo(this.posPendiente, this.factor)
      } catch {
        /* nada */
      }
      this.posPendiente = null
    }
    el.defaultPlaybackRate = this.rate
    el.playbackRate = this.rate
    if (!this.estado.duracion && Number.isFinite(el.duration))
      this.poner({ duracion: tiempoEn1x(el.duration, this.factor) })
  }

  // ------------------------------------------------------------ controles
  reproducir() {
    const el = this.audio()
    if (!el || !this.urls.u1) return
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
    this.el?.pause()
  }

  alternar() {
    if (this.estado.fase === 'reproduciendo') this.pausar()
    else this.reproducir()
  }

  /** Posición actual en la línea de tiempo 1x. */
  posicion(): number {
    const el = this.el
    if (!el || !this.urls.u1) return this.estado.posicion
    if (this.posPendiente != null) return this.posPendiente
    return tiempoEn1x(el.currentTime || 0, this.factor)
  }

  buscar(pos1x: number) {
    const el = this.el
    const max = this.estado.duracion || Number.MAX_SAFE_INTEGER
    const p = Math.max(0, Math.min(max - 0.05, pos1x))
    if (el && this.urls.u1) {
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

  capituloSiguiente() {
    const l = this.estado.libro
    if (!l) return
    if (this.estado.capitulo + 1 < l.capitulos.length)
      this.cargar(this.estado.capitulo + 1, 0, this.estado.fase === 'reproduciendo' || this.estado.fase === 'cargando')
  }

  capituloAnterior() {
    if (this.posicion() > 5 || this.estado.capitulo === 0) return this.buscar(0)
    this.cargar(this.estado.capitulo - 1, 0, this.estado.fase === 'reproduciendo')
  }

  irACapitulo(capitulo: number, reproducir = true) {
    this.cargar(capitulo, 0, reproducir)
  }

  /** "Escuchar desde aquí": salta a la frase (cargando su capítulo si hace falta). */
  irAFrase(fraseId: string, reproducir = true) {
    const cap = capituloDeFrase(fraseId)
    if (cap >= 0 && cap !== this.estado.capitulo) {
      this.cargar(cap, 0, reproducir, fraseId)
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
    if (!this.el || !this.urls.u1) return
    if (antes.variante !== despues.variante) this.ponerFuente(pos, sonando)
    else {
      this.rate = this.factor === 2 ? despues.rate : Math.min(nueva, 4)
      this.el.defaultPlaybackRate = this.rate
      this.el.playbackRate = this.rate
      this.posicionSesion()
    }
  }

  setVoz(vozId: string, nombreVoz: string) {
    if (vozId === this.estado.vozId) return
    const pos = this.posicion()
    const frase = this.estado.fraseId
    const sonando = this.estado.fase === 'reproduciendo'
    this.poner({ vozId, nombreVoz })
    if (this.estado.libro) this.cargar(this.estado.capitulo, frase ? 0 : pos, sonando, frase)
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
    if (!el || el.src === SILENCIO || !this.urls.u1) return
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
    if (!l || !this.urls.u1) return
    if (this.estado.temporizador?.tipo === 'capitulo') {
      this.poner({ temporizador: null, fase: 'pausado', mensaje: MENSAJES.vozFinCapitulo })
      this.guardar(true)
      return
    }
    if (this.estado.capitulo + 1 < l.capitulos.length) {
      // Mismo elemento, nuevo src: así iOS sigue sonando con la pantalla bloqueada.
      this.cargar(this.estado.capitulo + 1, 0, true)
    } else {
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
      posicionAudioSeg: Number(pos.toFixed(2)),
      vozId: this.estado.vozId,
      velocidad: this.estado.velocidad,
      porcentaje: Number(porcentaje.toFixed(2)),
      modo: 'VOZ',
      dispositivo: this.deps.dispositivo(),
      actualizadoEn: new Date(this.deps.ahora()).toISOString(),
    }
  }

  guardar(servidor: boolean) {
    const p = this.progresoActual()
    if (!p || !this.urls.u1) return
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

  /** Deja de sonar y olvida el libro (al cerrar sesión). */
  detener() {
    this.turno++
    this.cancelarSondeo()
    this.guardar(true)
    this.el?.pause()
    this.urls = { u1: null, u2: null }
    this.tiempos = null
    this.poner({ ...inicial })
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
      h('seekto', (d) => d?.seekTime != null && this.buscar(tiempoEn1x(d.seekTime, this.factor)))
      this.estadoSesion(this.estado.fase === 'reproduciendo' ? 'playing' : 'paused')
      this.posicionSesion()
    } catch (e) {
      console.error('[voz] Media Session', e)
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

  private posicionSesion() {
    const ms = sesion()
    const el = this.el
    if (!ms?.setPositionState || !el || !Number.isFinite(el.duration) || el.duration <= 0) return
    try {
      ms.setPositionState({
        duration: el.duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(el.duration, el.currentTime || 0),
      })
    } catch {
      /* posición fuera de rango mientras cambia el src */
    }
  }
}
