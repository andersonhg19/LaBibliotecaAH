import { BIBLIOTECA_PREFIJO, VOZ_POR_DEFECTO } from '@config'
import api from '@servicios/api'
import { nnn, urlBinaria, urlFrasesCapitulo, urlLibro, urlPortada } from '@servicios/archivos'
import type { CapituloResumen, EjemplarDetalleDTO, PreparacionLibroDTO, ProgresoDTO, ResultDTO } from '@tipos'
import { anotarDiario } from '@utils/diario'

/**
 * Libros disponibles sin conexión (0.5.0, contrato C12).
 *
 * Regla de producto (Anderson, 2026-11-25): un libro en «Leyendo» tiene TODAS sus
 * pistas de voz preparadas en el servidor y descargadas en el dispositivo; al pasar
 * a Leído / Abandonado / Por leer (o al quitarlo de «Leyendo») se borra la copia del
 * DISPOSITIVO. El audio del servidor no se borra. Nunca se espera a la descarga para
 * empezar a escuchar: es en segundo plano.
 *
 * ESTE ARCHIVO ES EL CONTRATO entre la ola de voz (que lo implementa: service worker,
 * Cache Storage, cola de descargas) y la ola de UI (que solo lo consume). La firma de
 * lo exportado no cambia sin acordarlo.
 *
 * CÓMO FUNCIONA (ola de voz):
 *   · `POST /v1/voz/preparar-libro {ejemplarId, vozId, desdeCapitulo}` encola en el
 *     taller lo que falte, desde donde vas (no espera nada);
 *   · de uno en uno (un capítulo de un libro cada vez, sin saturar la red), se mira si
 *     el capítulo ya está (su `cap-NNN.tiempos.json`, que el taller escribe el último y
 *     de forma atómica: leerlo no encola ni cambia prioridades, a diferencia de
 *     `/audio/estado`); si está, se bajan EXACTAMENTE las URL que pide el motor —
 *     `cap-NNN.m4a`, `cap-NNN-2x.m4a`, `cap-NNN.tiempos.json` y `frases/cap-NNN.json`—
 *     más la portada y el EPUB, a la caché `bah-libro-<ejemplarId>` con la URL SIN el
 *     token como clave; y se deja el estado LISTO de ese capítulo para que
 *     `/audio/estado` responda sin red (lo sirve el service worker, public/sw.js);
 *   · lo que aún no está se vuelve a mirar con espera creciente (5 s → 60 s);
 *   · si el servidor ya no tiene nada en cola y un capítulo no aparece (ERROR del
 *     taller), se da por «sin voz» y no bloquea el resto;
 *   · sin espacio (cuota de iOS) → estado 'error' + evento `descarga-error` al diario.
 */

/** Estado de la copia local de un libro. */
export type EstadoSinConexion =
  /** No hay copia ni se está haciendo (libro fuera de «Leyendo» o sin audio). */
  | 'ninguno'
  /** El servidor aún está preparando capítulos y/o se están bajando. */
  | 'descargando'
  /** Todos los capítulos en voz del libro están en el dispositivo. */
  | 'completo'
  /** El navegador no deja guardar (sin service worker, sin espacio o modo privado). */
  | 'no-disponible'
  /** Algo falló; se reintenta solo en la siguiente sincronización. */
  | 'error'

export interface ProgresoSinConexion {
  ejemplarId: string
  estado: EstadoSinConexion
  /** Capítulos en voz del libro (los de `enVoz`). */
  total: number
  /** Capítulos ya guardados en el dispositivo. */
  guardados: number
  /** Bytes que ocupa la copia local (aprox.). */
  bytes: number
  /** Texto corto para la UI, en español («12 de 40 capítulos sin conexión»). */
  mensaje: string
}

// ------------------------------------------------------------------ lógica (inyectable, probada sola)

/** Lo que se recuerda de cada copia (en localStorage). */
export interface MetaSinConexion {
  ejemplarId: string
  archivoId: string
  vozId: string
  /** Capítulos en voz, en el orden en que se bajan (desde donde vas). */
  capitulos: number[]
  guardados: number[]
  /** Capítulos que el servidor no pudo generar (no bloquean el «completo»). */
  sinVoz: number[]
  bytes: number
  estado: EstadoSinConexion
  error: string | null
  /** Ya se bajaron portada y EPUB. */
  extras: boolean
}

export interface CacheMinima {
  put(clave: string, r: Response): Promise<void>
  match(clave: string): Promise<Response | undefined>
}

export interface DepsSinConexion {
  disponible: () => boolean
  abrirCache: (nombre: string) => Promise<CacheMinima>
  borrarCache: (nombre: string) => Promise<boolean>
  bajar: (url: string, senal?: AbortSignal) => Promise<Response>
  detalle: (ejemplarId: string) => Promise<EjemplarDetalleDTO | null>
  progreso: (ejemplarId: string) => Promise<ProgresoDTO | null>
  /** La voz que el usuario eligió en este dispositivo (preferencias). */
  vozPreferida: () => Promise<string | null>
  preparar: (d: { ejemplarId: string; vozId: string; desdeCapitulo: number }) => Promise<unknown>
  estadoPreparacion: (ejemplarId: string, vozId: string) => Promise<PreparacionLibroDTO | null>
  /** Lecturas de la API que conviene dejar en la caché del service worker (voces, progreso…). */
  calentar?: (ejemplarId: string) => Promise<unknown>
  /** URL absoluta con token de una ruta de binario (`/v1/archivos/…`). */
  url: (ruta: string) => string | null
  urlFrases: (archivoId: string, capitulo: number) => string
  urlPortada: (archivoId: string) => string
  urlLibro: (archivoId: string) => string
  origen: () => string
  almacen: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null
  /** Espacio libre aproximado (bytes) o null si no se sabe. */
  espacioLibre: () => Promise<number | null>
  persistir: () => Promise<unknown>
  dormir: (ms: number) => Promise<void>
  anotar: (tipo: string, detalle: string, ejemplarId: string) => void
}

export const CLAVE_META = 'bah.sin-conexion'
/** Esperas entre vueltas sin avances (el taller va preparando): 5 s, 10, 20, 40 y luego cada 60 s. */
export const ESPERAS_MS = [5_000, 10_000, 20_000, 40_000, 60_000]
/** Por debajo de esto libre, no se baja otro capítulo (un capítulo de ~25 min a 48 kbps son ~9 MB + el 2x). */
export const MARGEN_BYTES = 40 * 1024 * 1024

export const nombreCacheLibro = (ejemplarId: string) => `bah-libro-${ejemplarId}`

/** La URL sin el token `t` (la clave en la caché: el token cambia, la copia no). Igual que sw-logica.js. */
export function sinToken(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('t')
    u.hash = ''
    return u.href
  } catch {
    return url.replace(/([?&])t=[^&#]*(&?)/, (_, a: string, b: string) => (b ? a : ''))
  }
}

/** La clave del estado LISTO de un capítulo (la misma que calcula el service worker al ver `/audio/estado`). */
export function claveEstado(origen: string, ejemplarId: string, vozId: string, capitulo: number): string {
  return `${origen}/__bah/estado/${encodeURIComponent(ejemplarId)}/${encodeURIComponent(vozId)}/${capitulo}`
}

/** Los capítulos que suenan (C3: ni apartados de la voz ni páginas sin palabras), desde `desde` y luego los de antes. */
export function ordenDeDescarga(caps: readonly CapituloResumen[], desde: number): number[] {
  const conVoz = caps
    .filter((c) => c.enVoz !== false && (c.minutosVoz ?? c.minutos) !== 0)
    .map((c) => c.indice)
    .sort((a, b) => a - b)
  return [...conVoz.filter((i) => i >= desde), ...conVoz.filter((i) => i < desde)]
}

export function progresoDe(m: MetaSinConexion | null, ejemplarId: string, disponible = true): ProgresoSinConexion {
  if (!m) {
    return {
      ejemplarId,
      estado: disponible ? 'ninguno' : 'no-disponible',
      total: 0,
      guardados: 0,
      bytes: 0,
      mensaje: disponible ? '' : 'Este navegador no puede guardar libros sin conexión.',
    }
  }
  const total = Math.max(0, m.capitulos.length - m.sinVoz.length)
  const guardados = m.guardados.length
  let mensaje = ''
  if (m.estado === 'completo')
    mensaje = `Guardado en el dispositivo · ${total} capítulo${total === 1 ? '' : 's'}${
      m.sinVoz.length ? ` (${m.sinVoz.length} sin voz)` : ''
    }`
  else if (m.estado === 'descargando') mensaje = `${guardados} de ${total} capítulos sin conexión`
  else if (m.estado === 'error') mensaje = m.error ?? 'No se pudo guardar el libro sin conexión; se reintentará.'
  else if (m.estado === 'no-disponible') mensaje = 'Este navegador no puede guardar libros sin conexión.'
  return { ejemplarId, estado: m.estado, total, guardados, bytes: Math.round(m.bytes), mensaje }
}

const esCuota = (e: unknown) => {
  const n = (e as { name?: string } | null)?.name ?? ''
  return n === 'QuotaExceededError' || /quota/i.test(String((e as { message?: string } | null)?.message ?? ''))
}

class SinEspacio extends Error {
  constructor() {
    super('No queda espacio en el dispositivo para guardar este libro.')
    this.name = 'SinEspacio'
  }
}

type Resultado = 'hecho' | 'progreso' | 'espera' | 'fallo'

export class GestorSinConexion {
  private metas: Record<string, MetaSinConexion> = {}
  private cola: string[] = []
  private trabajando = false
  private oyentes = new Set<(p: ProgresoSinConexion) => void>()
  /** Sube al olvidar un libro: lo que estaba en vuelo de antes ya no escribe. */
  private generacion = new Map<string, number>()
  private control = new Map<string, AbortController>()
  private persistido = false
  /** Libros ya preparados en esta sesión (detalle leído, voz decidida y el servidor avisado). */
  private preparados = new Set<string>()
  private despertar: (() => void) | null = null

  constructor(private d: DepsSinConexion) {
    try {
      const g = d.almacen?.getItem(CLAVE_META)
      const l = g ? (JSON.parse(g) as Record<string, MetaSinConexion>) : null
      if (l && typeof l === 'object') this.metas = l
    } catch {
      this.metas = {}
    }
  }

  escuchar(fn: (p: ProgresoSinConexion) => void): () => void {
    this.oyentes.add(fn)
    return () => {
      this.oyentes.delete(fn)
    }
  }

  progreso(ejemplarId: string): ProgresoSinConexion {
    return progresoDe(this.metas[ejemplarId] ?? null, ejemplarId, this.d.disponible())
  }

  listar(): ProgresoSinConexion[] {
    return Object.keys(this.metas).map((id) => this.progreso(id))
  }

  /** ¿Se está trabajando (para las pruebas)? */
  get ocupado(): boolean {
    return this.trabajando
  }

  private guardarMetas() {
    try {
      this.d.almacen?.setItem(CLAVE_META, JSON.stringify(this.metas))
    } catch {
      /* sin almacenamiento: en memoria */
    }
  }

  private avisar(ejemplarId: string) {
    this.guardarMetas()
    const p = this.progreso(ejemplarId)
    this.oyentes.forEach((f) => {
      try {
        f(p)
      } catch {
        /* un oyente roto no para nada */
      }
    })
  }

  async sincronizar(leyendo: ReadonlyArray<{ id: string }>): Promise<void> {
    const quiero = new Set(leyendo.map((l) => l.id))
    for (const id of Object.keys(this.metas)) if (!quiero.has(id)) await this.olvidar(id)
    for (const id of [...this.cola]) if (!quiero.has(id)) this.cola = this.cola.filter((x) => x !== id)
    for (const l of leyendo) await this.guardar(l.id)
  }

  async guardar(ejemplarId: string): Promise<void> {
    if (!this.d.disponible()) {
      this.avisar(ejemplarId)
      return
    }
    // Aunque esté completo se vuelve a mirar (una vez por sesión): pudo cambiar la voz elegida o los capítulos.
    if (!this.cola.includes(ejemplarId)) this.cola.push(ejemplarId)
    this.despertar?.()
    void this.trabajar()
  }

  async olvidar(ejemplarId: string): Promise<void> {
    this.generacion.set(ejemplarId, (this.generacion.get(ejemplarId) ?? 0) + 1)
    this.preparados.delete(ejemplarId)
    this.control.get(ejemplarId)?.abort()
    this.control.delete(ejemplarId)
    this.cola = this.cola.filter((x) => x !== ejemplarId)
    const tenia = !!this.metas[ejemplarId]
    delete this.metas[ejemplarId]
    try {
      await this.d.borrarCache(nombreCacheLibro(ejemplarId))
    } catch {
      /* nada que borrar */
    }
    if (tenia) this.avisar(ejemplarId)
    else this.guardarMetas()
  }

  async olvidarTodo(): Promise<void> {
    for (const id of Object.keys(this.metas)) await this.olvidar(id)
  }

  /** El bucle: un capítulo de un libro por vez; si en una vuelta nadie avanzó, se espera (cada vez más). */
  private async trabajar(): Promise<void> {
    if (this.trabajando) return
    this.trabajando = true
    let espera = 0
    try {
      while (this.cola.length) {
        let avanzo = false
        for (const id of [...this.cola]) {
          let r: Resultado
          try {
            r = await this.avanzar(id)
          } catch {
            r = 'fallo'
          }
          if (r === 'hecho' || r === 'fallo') this.cola = this.cola.filter((x) => x !== id)
          if (r === 'progreso' || r === 'hecho') avanzo = true
        }
        if (!this.cola.length) break
        if (avanzo) {
          espera = 0
          continue
        }
        await this.dormir(ESPERAS_MS[Math.min(espera, ESPERAS_MS.length - 1)])
        espera++
      }
    } finally {
      this.trabajando = false
    }
  }

  private dormir(ms: number): Promise<void> {
    return new Promise<void>((resolver) => {
      let hecho = false
      const fin = () => {
        if (hecho) return
        hecho = true
        this.despertar = null
        resolver()
      }
      this.despertar = fin
      this.d.dormir(ms).then(fin, fin)
    })
  }

  /** Despierta la cola ya (al volver la red). */
  reanudar() {
    this.despertar?.()
    if (this.cola.length) void this.trabajar()
  }

  /** Prepara la copia (primera vez) o baja el siguiente capítulo que ya esté. */
  private async avanzar(id: string): Promise<Resultado> {
    const gen = this.generacion.get(id) ?? 0
    const vigente = () => (this.generacion.get(id) ?? 0) === gen
    let m: MetaSinConexion | undefined = this.metas[id]
    if (!m || !this.preparados.has(id) || m.estado === 'error' || m.estado === 'no-disponible') {
      const nueva = await this.preparar(id, m ?? null)
      if (!vigente()) return 'hecho'
      if (nueva === 'sin-red') return m ? (m.estado === 'completo' ? 'hecho' : 'espera') : 'espera'
      if (!nueva) return 'fallo'
      this.preparados.add(id)
      m = nueva
    }
    if (m.estado === 'completo') return 'hecho'
    const pendientes = m.capitulos.filter((c) => !m!.guardados.includes(c) && !m!.sinVoz.includes(c))
    if (!pendientes.length) {
      m.estado = 'completo'
      m.error = null
      this.avisar(id)
      return 'hecho'
    }
    const cap = pendientes[0]
    try {
      const libre = await this.d.espacioLibre().catch(() => null)
      if (libre != null && libre < MARGEN_BYTES) throw new SinEspacio()
      const r = await this.bajarCapitulo(m, cap, vigente)
      if (!vigente()) return 'hecho'
      if (r === 'no-esta') {
        // ¿Lo sigue preparando el servidor? Si ya no queda nada en cola, ese capítulo no tendrá voz (ERROR).
        const e = await this.d.estadoPreparacion(id, m.vozId).catch(() => null)
        if (e && e.enCola === 0) {
          m.sinVoz.push(cap)
          this.avisar(id)
          return 'progreso'
        }
        return 'espera'
      }
      if (!this.persistido) {
        this.persistido = true
        this.d.persistir().catch(() => undefined)
      }
      m.guardados.push(cap)
      m.bytes += r
      if (!m.extras) await this.bajarExtras(m, vigente)
      const quedan = m.capitulos.some((c) => !m!.guardados.includes(c) && !m!.sinVoz.includes(c))
      m.estado = quedan ? 'descargando' : 'completo'
      this.avisar(id)
      return quedan ? 'progreso' : 'hecho'
    } catch (e) {
      if (!vigente()) return 'hecho'
      if (e instanceof SinEspacio || esCuota(e)) {
        m.estado = 'error'
        m.error = new SinEspacio().message
        this.d.anotar('descarga-error', `cuota: cap ${cap} ${String((e as Error)?.message ?? e).slice(0, 200)}`, id)
        this.avisar(id)
        return 'fallo'
      }
      // Sin red (o el servidor no responde): se queda en la cola y se reintenta en la siguiente vuelta.
      return 'espera'
    }
  }

  /** Lo de una vez por libro: detalle, voz, preparar en el servidor. */
  private async preparar(id: string, previa: MetaSinConexion | null): Promise<MetaSinConexion | null | 'sin-red'> {
    let libro: EjemplarDetalleDTO | null = null
    try {
      libro = await this.d.detalle(id)
    } catch {
      // Sin red: lo que hubiera se queda como estaba y se reintenta en la siguiente vuelta.
      return 'sin-red'
    }
    if (!libro) {
      delete this.metas[id]
      this.avisar(id)
      return null
    }
    if (!libro.archivoId) {
      // Libro «solo registro» (C11) o deseo: no hay voz que guardar.
      delete this.metas[id]
      this.avisar(id)
      return null
    }
    const progreso = libro.progreso ?? (await this.d.progreso(id).catch(() => null))
    const vozId =
      (progreso?.modo === 'VOZ' && progreso.vozId) ||
      (await this.d.vozPreferida().catch(() => null)) ||
      progreso?.vozId ||
      VOZ_POR_DEFECTO
    const caps = libro.capitulos ?? []
    const desde = Math.max(0, progreso?.capitulo ?? 0)
    const capitulos = ordenDeDescarga(caps, desde)
    let m: MetaSinConexion
    if (previa && previa.vozId === vozId && previa.archivoId === libro.archivoId) {
      m = previa
      m.capitulos = capitulos
      m.guardados = m.guardados.filter((c) => capitulos.includes(c))
      m.sinVoz = []
    } else {
      // Otra voz (o primera vez): lo de antes no sirve.
      if (previa) await this.d.borrarCache(nombreCacheLibro(id)).catch(() => false)
      m = {
        ejemplarId: id,
        archivoId: libro.archivoId,
        vozId,
        capitulos,
        guardados: [],
        sinVoz: [],
        bytes: 0,
        estado: 'descargando',
        error: null,
        extras: false,
      }
    }
    const quedan = capitulos.some((c) => !m.guardados.includes(c))
    m.estado = quedan || !capitulos.length ? 'descargando' : 'completo'
    m.error = null
    if (!capitulos.length) m.estado = 'completo'
    this.metas[id] = m
    this.avisar(id)
    if (quedan) {
      // En segundo plano: el servidor encola desde donde vas; no se espera a nada.
      this.d.preparar({ ejemplarId: id, vozId, desdeCapitulo: desde }).catch(() => undefined)
      this.d.calentar?.(id).catch(() => undefined)
    }
    return m
  }

  /** Baja los archivos de un capítulo. Devuelve los bytes, o 'no-esta' si el taller aún no lo tiene. */
  private async bajarCapitulo(m: MetaSinConexion, cap: number, vigente: () => boolean): Promise<number | 'no-esta'> {
    const base = `/v1/archivos/${encodeURIComponent(m.archivoId)}/audio/${m.vozId}/cap-${nnn(cap)}`
    const uTiempos = this.d.url(`${base}.tiempos.json`)
    const u1 = this.d.url(`${base}.m4a`)
    const u2 = this.d.url(`${base}-2x.m4a`)
    const uFrases = this.d.urlFrases(m.archivoId, cap)
    if (!uTiempos || !u1 || !u2) return 'no-esta'
    const control = typeof AbortController === 'function' ? new AbortController() : undefined
    if (control) this.control.set(m.ejemplarId, control)
    try {
      const rt = await this.d.bajar(uTiempos, control?.signal)
      if (rt.status === 404) return 'no-esta'
      if (!rt.ok) throw new Error(`tiempos ${rt.status}`)
      const tiempos = (await rt.clone().json()) as { duracion?: number }
      const archivos: [string, Response][] = [[uTiempos, rt]]
      let bytes = Number(rt.headers.get('content-length')) || 0
      for (const u of [u1, u2, uFrases]) {
        const r = await this.d.bajar(u, control?.signal)
        // Las frases pueden faltar en un libro raro: el audio basta para escuchar.
        if (!r.ok) {
          if (u === uFrases) continue
          throw new Error(`audio ${r.status}`)
        }
        bytes += Number(r.headers.get('content-length')) || 0
        archivos.push([u, r])
      }
      if (!vigente()) return 0
      const cache = await this.d.abrirCache(nombreCacheLibro(m.ejemplarId))
      for (const [u, r] of archivos) await cache.put(sinToken(u), r)
      const estado: ResultDTO<unknown> = {
        correct: true,
        message: 'OK',
        errorCode: 0,
        object: {
          estado: 'LISTO',
          duracionSeg: typeof tiempos?.duracion === 'number' ? tiempos.duracion : null,
          url1x: `${base}.m4a`,
          url2x: `${base}-2x.m4a`,
          urlTiempos: `${base}.tiempos.json`,
          error: null,
          urlPartes: null,
        },
      }
      await cache.put(
        claveEstado(this.d.origen(), m.ejemplarId, m.vozId, cap),
        new Response(JSON.stringify(estado), { headers: { 'Content-Type': 'application/json' } }),
      )
      return bytes
    } finally {
      if (this.control.get(m.ejemplarId) === control) this.control.delete(m.ejemplarId)
    }
  }

  /** Portada y EPUB (para «Ver texto», el lector y la pantalla de bloqueo). Si fallan, no pasa nada. */
  private async bajarExtras(m: MetaSinConexion, vigente: () => boolean) {
    try {
      const cache = await this.d.abrirCache(nombreCacheLibro(m.ejemplarId))
      for (const u of [this.d.urlPortada(m.archivoId), this.d.urlLibro(m.archivoId)]) {
        try {
          const r = await this.d.bajar(u)
          if (!r.ok || !vigente()) continue
          m.bytes += Number(r.headers.get('content-length')) || 0
          await cache.put(sinToken(u), r)
        } catch (e) {
          if (esCuota(e)) throw e
        }
      }
      m.extras = true
    } catch (e) {
      if (esCuota(e)) throw e
    }
  }
}

// ------------------------------------------------------------------ el gestor de la página

type GlobalSW = typeof globalThis & {
  __bahSW?: string
  caches?: CacheStorage
  localStorage?: Storage
  navigator?: Navigator
  location?: Location
}
const g = () => globalThis as GlobalSW

const B = BIBLIOTECA_PREFIJO

function depsNavegador(): DepsSinConexion {
  const disponible = () => {
    try {
      return !!g().__bahSW && typeof g().caches?.open === 'function'
    } catch {
      return false
    }
  }
  let almacen: DepsSinConexion['almacen'] = null
  try {
    almacen = g().localStorage ?? null
  } catch {
    almacen = null
  }
  return {
    disponible,
    abrirCache: async (n) => (await g().caches!.open(n)) as unknown as CacheMinima,
    borrarCache: async (n) => (g().caches ? g().caches!.delete(n) : false),
    bajar: (u, senal) => fetch(u, { mode: 'cors', credentials: 'omit', ...(senal ? { signal: senal } : {}) }),
    detalle: async (id) => {
      const r = await api.post<ResultDTO<EjemplarDetalleDTO>>(`${B}/libros/get/${encodeURIComponent(id)}`)
      return r.data?.correct ? r.data.object : null
    },
    progreso: async (id) => {
      const r = await api.post<ResultDTO<ProgresoDTO | null>>(`${B}/progreso/get/${encodeURIComponent(id)}`)
      return r.data?.correct ? r.data.object : null
    },
    vozPreferida: async () => {
      try {
        const p = g().localStorage?.getItem('@biblioteca_ah_preferencias')
        const v = p ? (JSON.parse(p) as { vozId?: unknown }).vozId : null
        return typeof v === 'string' && v ? v : null
      } catch {
        return null
      }
    },
    preparar: (d) => api.post(`${B}/voz/preparar-libro`, d),
    estadoPreparacion: async (ejemplarId, vozId) => {
      const r = await api.get<ResultDTO<PreparacionLibroDTO>>(`${B}/voz/preparar-libro`, {
        params: { ejemplarId, vozId },
      })
      return r.data?.correct ? r.data.object : null
    },
    // Lo que el reproductor pide al abrir, para que el service worker lo tenga sin red.
    calentar: async (id) =>
      Promise.allSettled([api.post(`${B}/progreso/get/${encodeURIComponent(id)}`), api.post(`${B}/voces/all`)]),
    url: (ruta) => urlBinaria(ruta),
    urlFrases: urlFrasesCapitulo,
    urlPortada,
    urlLibro,
    origen: () => g().location?.origin ?? '',
    almacen,
    espacioLibre: async () => {
      const e = await g().navigator?.storage?.estimate?.()
      return e && typeof e.quota === 'number' && typeof e.usage === 'number' ? e.quota - e.usage : null
    },
    persistir: async () => g().navigator?.storage?.persist?.(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    anotar: (tipo, detalle, ejemplarId) => anotarDiario(tipo, { ejemplarId, detalle }),
  }
}

let gestor: GestorSinConexion | null = null
function elGestor(): GestorSinConexion {
  if (!gestor) {
    gestor = new GestorSinConexion(depsNavegador())
    try {
      const w = g() as GlobalSW & { addEventListener?: (t: string, f: () => void) => void }
      w.addEventListener?.('online', () => gestor?.reanudar())
    } catch {
      /* nada */
    }
  }
  return gestor
}

/** Para las pruebas: usa este gestor (o vuelve al de la página con null). */
export function usarGestorSinConexion(g2: GestorSinConexion | null) {
  gestor = g2
}

// ------------------------------------------------------------------ el contrato (no cambiar las firmas)

/** ¿Este navegador puede guardar libros sin conexión? (service worker + Cache Storage). */
export function sinConexionDisponible(): boolean {
  try {
    return (
      !!g().__bahSW && typeof g().caches?.open === 'function' && !!g().navigator && 'serviceWorker' in g().navigator!
    )
  } catch {
    return false
  }
}

/**
 * Ajusta las copias locales a la lista de libros en «Leyendo»: prepara y baja los que
 * faltan (en segundo plano, de uno en uno) y BORRA las copias de los que ya no están.
 * Idempotente; se puede llamar al abrir la app, al volver la red y tras cambiar un estado.
 */
export async function sincronizarSinConexion(leyendo: ReadonlyArray<{ id: string }>): Promise<void> {
  try {
    await elGestor().sincronizar(leyendo)
  } catch (e) {
    console.warn('[sin conexión] no se pudo sincronizar', e)
  }
}

/** Empieza (o retoma) la copia local de un libro. No espera a que termine. */
export async function guardarSinConexion(ejemplarId: string): Promise<void> {
  try {
    await elGestor().guardar(ejemplarId)
  } catch (e) {
    console.warn('[sin conexión] no se pudo guardar', e)
  }
}

/** Borra la copia local de un libro (no toca el servidor). */
export async function olvidarSinConexion(ejemplarId: string): Promise<void> {
  try {
    await elGestor().olvidar(ejemplarId)
  } catch (e) {
    console.warn('[sin conexión] no se pudo borrar', e)
  }
}

/** Estado actual de un libro. */
export async function progresoSinConexion(ejemplarId: string): Promise<ProgresoSinConexion> {
  return elGestor().progreso(ejemplarId)
}

/** Todas las copias locales (para Ajustes). */
export async function listarSinConexion(): Promise<ProgresoSinConexion[]> {
  return elGestor().listar()
}

/** Se suscribe a cambios de progreso de cualquier libro; devuelve la función para darse de baja. */
export function escucharSinConexion(fn: (p: ProgresoSinConexion) => void): () => void {
  return elGestor().escuchar(fn)
}

/** (Extra de la ola de voz) Borra TODAS las copias del dispositivo (p. ej. al cerrar sesión). */
export async function olvidarTodoSinConexion(): Promise<void> {
  try {
    await elGestor().olvidarTodo()
  } catch {
    /* nada */
  }
}
