/*
 * LIBROS SIN CONEXIÓN (0.5.0, contrato C12): la copia del dispositivo de los libros en
 * «Leyendo». Con cachés, red y API de mentira: qué se pide al servidor, qué URL se bajan
 * (exactamente las que pide el motor), con qué clave, en qué orden, cuándo se espera,
 * cuándo se borra y qué pasa sin espacio.
 */
import type { CapituloResumen, EjemplarDetalleDTO } from '@tipos'
import {
  CacheMinima,
  DepsSinConexion,
  ESPERAS_MS,
  GestorSinConexion,
  MARGEN_BYTES,
  ProgresoSinConexion,
  claveEstado,
  guardarSinConexion,
  listarSinConexion,
  ordenDeDescarga,
  progresoSinConexion,
  sinConexionDisponible,
  usarGestorSinConexion,
} from '@utils/sinConexion'

const API = 'https://api.casa:7051/BIBLIOTECA-SERVICE/biblioteca'
const WEB = 'https://web.casa:7050'
const VOZ = 'edge.es-ES-ElviraNeural'

const caps = (...c: Partial<CapituloResumen>[]): CapituloResumen[] =>
  c.map((x, i) => ({ indice: i, titulo: `Cap ${i}`, minutos: 3, ...x }))

const detalle = (o: Partial<EjemplarDetalleDTO> = {}): EjemplarDetalleDTO =>
  ({
    id: 'e1',
    archivoId: 'a1',
    titulo: 'El faro',
    capitulos: caps({}, {}, {}, {}),
    progreso: {
      ejemplarId: 'e1',
      capitulo: 2,
      fraseId: null,
      cfi: null,
      posicionAudioSeg: 10,
      vozId: VOZ,
      velocidad: 1,
      porcentaje: 40,
      modo: 'VOZ',
      dispositivo: null,
      actualizadoEn: '',
    },
    ...o,
  }) as EjemplarDetalleDTO

class CacheFalsa implements CacheMinima {
  datos = new Map<string, Response>()
  lleno = false
  async put(k: string, r: Response) {
    if (this.lleno) throw Object.assign(new Error('QuotaExceededError: no space'), { name: 'QuotaExceededError' })
    this.datos.set(k, r)
  }
  async match(k: string) {
    return this.datos.get(k)
  }
}

function montar(o: Partial<DepsSinConexion> & { listos?: Set<number>; enCola?: number } = {}) {
  const cachesFalsas = new Map<string, CacheFalsa>()
  const bajadas: string[] = []
  const preparados: unknown[] = []
  const anotados: string[] = []
  const listos = o.listos ?? new Set([0, 1, 2, 3])
  let enCola = o.enCola ?? 0
  let dormir: (() => void) | null = null
  let persistidas = 0
  const almacen: Record<string, string> = {}
  const deps: DepsSinConexion = {
    disponible: () => true,
    abrirCache: async (n) => {
      if (!cachesFalsas.has(n)) cachesFalsas.set(n, new CacheFalsa())
      return cachesFalsas.get(n)!
    },
    borrarCache: async (n) => cachesFalsas.delete(n),
    bajar: async (u) => {
      bajadas.push(u)
      const cap = /cap-(\d{3})/.exec(u)
      if (cap && /tiempos/.test(u) && !listos.has(Number(cap[1]))) return new Response('', { status: 404 })
      const cuerpo = /tiempos/.test(u) ? JSON.stringify({ duracion: 123.4, frases: [] }) : 'xxxxxxxxxx'
      return new Response(cuerpo, { status: 200, headers: { 'content-length': String(cuerpo.length) } })
    },
    detalle: async () => detalle(),
    progreso: async () => null,
    vozPreferida: async () => null,
    preparar: async (d) => preparados.push(d),
    estadoPreparacion: async () => ({ total: 4, listos: listos.size, enCola, error: 0 }),
    url: (ruta) => `${API}${ruta}?t=tok`,
    urlFrases: (a, c) => `${API}/v1/archivos/${a}/frases/cap-${String(c).padStart(3, '0')}.json?t=tok`,
    urlPortada: (a) => `${API}/v1/archivos/${a}/portada.jpg?t=tok`,
    urlLibro: (a) => `${API}/v1/archivos/${a}/libro.epub?t=tok`,
    origen: () => WEB,
    almacen: {
      getItem: (k) => almacen[k] ?? null,
      setItem: (k, v) => {
        almacen[k] = v
      },
    },
    espacioLibre: async () => 10 * 1024 ** 3,
    persistir: async () => persistidas++,
    dormir: () =>
      new Promise<void>((r) => {
        dormir = r
      }),
    anotar: (tipo, detalle) => anotados.push(`${tipo}: ${detalle}`),
    ...o,
  }
  const gestor = new GestorSinConexion(deps)
  const eventos: ProgresoSinConexion[] = []
  gestor.escuchar((p) => eventos.push(p))
  return {
    gestor,
    deps,
    cachesFalsas,
    bajadas,
    preparados,
    anotados,
    eventos,
    listos,
    almacen,
    persistidas: () => persistidas,
    fijarEnCola: (n: number) => (enCola = n),
    /** Termina la espera en curso (como si pasara el tiempo). */
    despertar: () => dormir?.(),
  }
}

const vaciar = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('C12 · copia de un libro en «Leyendo»', () => {
  it('avisa al servidor desde donde vas y baja exactamente lo que pide el motor, sin el token en la clave', async () => {
    const m = montar()
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.preparados).toEqual([{ ejemplarId: 'e1', vozId: VOZ, desdeCapitulo: 2 }])
    // Desde el capítulo 2 (donde vas) y luego los de antes, de uno en uno.
    const tiempos = m.bajadas.filter((u) => u.includes('tiempos')).map((u) => /cap-(\d+)/.exec(u)![1])
    expect(tiempos).toEqual(['002', '003', '000', '001'])
    const cache = m.cachesFalsas.get('bah-libro-e1')!
    const base = `${API}/v1/archivos/a1/audio/${VOZ}/cap-002`
    for (const k of [
      `${base}.m4a`,
      `${base}-2x.m4a`,
      `${base}.tiempos.json`,
      `${API}/v1/archivos/a1/frases/cap-002.json`,
    ])
      expect(cache.datos.has(k)).toBe(true)
    expect(cache.datos.has(`${API}/v1/archivos/a1/portada.jpg`)).toBe(true)
    expect(cache.datos.has(`${API}/v1/archivos/a1/libro.epub`)).toBe(true)
    expect([...cache.datos.keys()].some((k) => k.includes('t=tok'))).toBe(false)
    const p = m.gestor.progreso('e1')
    expect(p).toMatchObject({ estado: 'completo', total: 4, guardados: 4 })
    expect(p.mensaje).toBe('Guardado en el dispositivo · 4 capítulos')
    expect(m.persistidas()).toBe(1)
  })

  it('deja el estado LISTO de cada capítulo para que /audio/estado responda sin red', async () => {
    const m = montar()
    await m.gestor.guardar('e1')
    await vaciar()
    const r = await m.cachesFalsas.get('bah-libro-e1')!.match(claveEstado(WEB, 'e1', VOZ, 3))
    const d = await r!.json()
    expect(d).toEqual({
      correct: true,
      message: 'OK',
      errorCode: 0,
      object: {
        estado: 'LISTO',
        duracionSeg: 123.4,
        url1x: `/v1/archivos/a1/audio/${VOZ}/cap-003.m4a`,
        url2x: `/v1/archivos/a1/audio/${VOZ}/cap-003-2x.m4a`,
        urlTiempos: `/v1/archivos/a1/audio/${VOZ}/cap-003.tiempos.json`,
        error: null,
        urlPartes: null,
      },
    })
  })

  it('solo los capítulos que suenan (ni apartados de la voz ni páginas vacías)', () => {
    const l = caps({}, { enVoz: false }, { minutos: 0 }, { minutosVoz: 0 }, {}, {})
    expect(ordenDeDescarga(l, 4)).toEqual([4, 5, 0])
    expect(ordenDeDescarga(l, 0)).toEqual([0, 4, 5])
  })

  it('lo que el taller aún no tiene se vuelve a mirar después (con espera); y se avisa del progreso', async () => {
    const m = montar({ listos: new Set([2]), enCola: 3 })
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.gestor.progreso('e1')).toMatchObject({ estado: 'descargando', guardados: 1, total: 4 })
    expect(m.gestor.progreso('e1').mensaje).toBe('1 de 4 capítulos sin conexión')
    expect(m.eventos.some((e) => e.estado === 'descargando' && e.guardados === 1)).toBe(true)
    m.listos.add(3)
    m.listos.add(0)
    m.listos.add(1)
    m.despertar()
    await vaciar()
    expect(m.gestor.progreso('e1').estado).toBe('completo')
    expect(ESPERAS_MS[0]).toBe(5_000)
  })

  it('un capítulo que el servidor no pudo generar (nada en cola) no bloquea el «completo»', async () => {
    const m = montar({ listos: new Set([0, 2, 3]), enCola: 0 })
    await m.gestor.guardar('e1')
    await vaciar()
    const p = m.gestor.progreso('e1')
    expect(p).toMatchObject({ estado: 'completo', total: 3, guardados: 3 })
    expect(p.mensaje).toContain('(1 sin voz)')
  })

  it('con la voz del dispositivo si el progreso no era de voz', async () => {
    const m = montar({
      detalle: async () => detalle({ progreso: null }),
      vozPreferida: async () => 'edge.es-MX-JorgeNeural',
    })
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.preparados).toEqual([{ ejemplarId: 'e1', vozId: 'edge.es-MX-JorgeNeural', desdeCapitulo: 0 }])
    expect(m.bajadas.some((u) => u.includes('/audio/edge.es-MX-JorgeNeural/cap-000'))).toBe(true)
  })

  it('libro sin archivo («solo registro»): no hay nada que guardar', async () => {
    const m = montar({ detalle: async () => detalle({ archivoId: null }) })
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.bajadas).toEqual([])
    expect(m.gestor.progreso('e1').estado).toBe('ninguno')
  })
})

describe('C12 · borrar la copia al salir de «Leyendo»', () => {
  it('sincronizar borra las copias de los libros que ya no están y baja los nuevos', async () => {
    const m = montar()
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.cachesFalsas.has('bah-libro-e1')).toBe(true)
    m.deps.detalle = async (id) => detalle({ id, archivoId: 'a2' })
    await m.gestor.sincronizar([{ id: 'e2' }])
    await vaciar()
    expect(m.cachesFalsas.has('bah-libro-e1')).toBe(false)
    expect(m.gestor.progreso('e1').estado).toBe('ninguno')
    expect(m.gestor.progreso('e2').estado).toBe('completo')
    expect(m.gestor.listar().map((p) => p.ejemplarId)).toEqual(['e2'])
  })

  it('olvidar en plena descarga: lo que estaba en vuelo ya no escribe', async () => {
    const m = montar({ listos: new Set([2]), enCola: 3 })
    await m.gestor.guardar('e1')
    await vaciar()
    await m.gestor.olvidar('e1')
    m.listos.add(3)
    m.despertar()
    await vaciar()
    expect(m.cachesFalsas.has('bah-libro-e1')).toBe(false)
    expect(m.gestor.progreso('e1').estado).toBe('ninguno')
  })

  it('si cambia la voz elegida, la copia vieja se borra y se baja con la nueva', async () => {
    const m = montar()
    await m.gestor.guardar('e1')
    await vaciar()
    const otro = new GestorSinConexion({
      ...m.deps,
      detalle: async () => detalle({ progreso: { ...detalle().progreso!, vozId: 'edge.es-ES-AlvaroNeural' } }),
    })
    await otro.guardar('e1')
    await vaciar()
    expect(m.preparados.pop()).toEqual({ ejemplarId: 'e1', vozId: 'edge.es-ES-AlvaroNeural', desdeCapitulo: 2 })
    const claves = [...m.cachesFalsas.get('bah-libro-e1')!.datos.keys()]
    expect(claves.some((k) => k.includes(VOZ))).toBe(false)
    expect(otro.progreso('e1').estado).toBe('completo')
  })
})

describe('C12 · sin red, sin espacio, sin service worker', () => {
  it('sin red no se pierde: se queda «descargando» y sigue al despertar', async () => {
    let red = false
    const m = montar()
    const bajar = m.deps.bajar
    m.deps.bajar = async (u, s) => {
      if (!red) throw new TypeError('Failed to fetch')
      return bajar(u, s)
    }
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.gestor.progreso('e1').estado).toBe('descargando')
    red = true
    m.gestor.reanudar()
    await vaciar()
    expect(m.gestor.progreso('e1').estado).toBe('completo')
  })

  it('sin espacio (cuota de iOS): error claro y «descarga-error» al diario', async () => {
    const m = montar()
    m.deps.abrirCache = async (n) => {
      const c = new CacheFalsa()
      c.lleno = true
      m.cachesFalsas.set(n, c)
      return c
    }
    await m.gestor.guardar('e1')
    await vaciar()
    const p = m.gestor.progreso('e1')
    expect(p.estado).toBe('error')
    expect(p.mensaje).toBe('No queda espacio en el dispositivo para guardar este libro.')
    expect(m.anotados[0]).toMatch(/^descarga-error: cuota: cap 2/)
  })

  it('con poco espacio libre ni se intenta', async () => {
    const m = montar({ espacioLibre: async () => MARGEN_BYTES - 1 })
    await m.gestor.guardar('e1')
    await vaciar()
    expect(m.bajadas.filter((u) => u.includes('.m4a'))).toEqual([])
    expect(m.gestor.progreso('e1').estado).toBe('error')
  })

  it('las metas sobreviven a recargar la página', async () => {
    const m = montar()
    await m.gestor.guardar('e1')
    await vaciar()
    const otra = new GestorSinConexion(m.deps)
    expect(otra.progreso('e1')).toMatchObject({ estado: 'completo', guardados: 4 })
  })

  it('el contrato sin service worker (jest, desarrollo): no disponible y nada que listar', async () => {
    usarGestorSinConexion(null)
    expect(sinConexionDisponible()).toBe(false)
    await guardarSinConexion('e9')
    expect((await progresoSinConexion('e9')).estado).toBe('no-disponible')
    expect(await listarSinConexion()).toEqual([])
  })
})
