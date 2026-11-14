import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { consultar, facetas } from '@servicios/mock/consulta'
import {
  CAPITULOS_DEMO,
  DURACIONES_DEMO,
  ESTANTE_FAVORITOS,
  VOCES_DEMO,
  anotacionesIniciales,
  comentariosIniciales,
  estantesIniciales,
  librosIniciales,
  progresoInicial,
} from '@servicios/mock/datos'
import type { AnotacionDTO, ComentarioDTO, EjemplarDTO, EstanteDTO, ProgresoDTO } from '@tipos'

/*
 * LA API SIMULADA (modo demostración, EXPO_PUBLIC_MOCK=1).
 *
 * Es un adaptador de axios: las pantallas llaman a las mismas rutas del
 * contrato y reciben los mismos DTO, pero todo vive en memoria (y en
 * localStorage, para que la demostración recuerde el progreso al recargar).
 * Así la app entera se puede enseñar sin backend, y el día que el backend
 * esté, no cambia ni una línea de las pantallas.
 */

interface BaseDemo {
  libros: EjemplarDTO[]
  estantes: EstanteDTO[]
  items: Record<string, string[]>
  anotaciones: AnotacionDTO[]
  comentarios: ComentarioDTO[]
  progreso: Record<string, ProgresoDTO>
  audioPedido: Record<string, number>
  preparacion: Record<string, number>
  secuencia: number
}

const CLAVE = 'bah_demo_db_v1'

const nueva = (): BaseDemo => {
  const e = estantesIniciales()
  return {
    libros: librosIniciales(),
    estantes: e.estantes,
    items: e.items,
    anotaciones: anotacionesIniciales(),
    comentarios: comentariosIniciales(),
    progreso: progresoInicial(),
    audioPedido: {},
    preparacion: { 'ej-subido': 0 },
    secuencia: 100,
  }
}

const almacen = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

let db: BaseDemo = (() => {
  try {
    const g = almacen()?.getItem(CLAVE)
    if (g) return { ...nueva(), ...JSON.parse(g) }
  } catch {
    /* demo corrupta: se empieza de cero */
  }
  return nueva()
})()

const guardar = () => {
  try {
    almacen()?.setItem(CLAVE, JSON.stringify(db))
  } catch {
    /* sin almacenamiento: la demo vive solo en memoria */
  }
}

/** Para las pruebas: vuelve a los datos de fábrica. */
export const reiniciarDemo = () => {
  db = nueva()
  try {
    almacen()?.removeItem(CLAVE)
  } catch {
    /* nada */
  }
}
export const baseDemo = () => db

const ok = (object: unknown) => ({ correct: true, message: 'OK', errorCode: 0, object })
const fallo = (message: string, errorCode = 120) => ({ correct: false, message, errorCode, object: null })
const id = (prefijo: string) => `${prefijo}-${++db.secuencia}`
const ahora = () => new Date().toISOString()

const sincronizarFavoritos = () => {
  const favs = new Set(db.items[ESTANTE_FAVORITOS] ?? [])
  db.libros.forEach((l) => (l.favorito = favs.has(l.id)))
  db.estantes.forEach((e) => (e.nLibros = (db.items[e.id] ?? []).length))
}

const libro = (eid: string) => db.libros.find((l) => l.id === eid)

/** El taller "convierte" en unos pocos sondeos: PENDIENTE → PROCESANDO → LISTO. */
const avanzarPreparacion = () => {
  Object.keys(db.preparacion).forEach((eid) => {
    const l = libro(eid)
    if (!l) return void delete db.preparacion[eid]
    const paso = ++db.preparacion[eid]
    if (paso >= 2 && l.estadoConversion === 'PENDIENTE') l.estadoConversion = 'PROCESANDO'
    if (paso >= 4) {
      l.estadoConversion = 'LISTO'
      l.minutosEstimados = l.minutosEstimados ?? 240
      if (l.fuenteMetadatos === 'NOMBRE_ARCHIVO' && l.tipo === 'LIBRO') {
        l.titulo = l.titulo.replace(/\s*\(\d+\)\s*$/, '').replace(/^\w/, (c) => c.toUpperCase())
        l.fuenteMetadatos = 'ARCHIVO'
      }
      delete db.preparacion[eid]
    }
  })
}

const detalle = (l: EjemplarDTO) => {
  const esDemoFaro = l.archivoId === 'demo-faro'
  return {
    ...l,
    capitulos: esDemoFaro
      ? CAPITULOS_DEMO
      : l.archivoId
        ? [{ indice: 0, titulo: 'Lista de la biblioteca', minutos: 1 }]
        : [],
    progreso: db.progreso[l.id] ?? null,
  }
}

const FORMATOS: Record<string, EjemplarDTO['formatoOriginal']> = {
  epub: 'EPUB',
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  txt: 'TXT',
}

function subir(datos: unknown, config: InternalAxiosRequestConfig) {
  let archivo: { name?: string } | null = null
  let tipo: 'LIBRO' | 'DOCUMENTO' = 'LIBRO'
  let deseoId: string | null = null
  if (datos instanceof FormData || (datos && typeof (datos as FormData).get === 'function')) {
    const f = datos as FormData
    archivo = f.get('archivos') as { name?: string } | null
    tipo = f.get('tipo') === 'DOCUMENTO' ? 'DOCUMENTO' : 'LIBRO'
    deseoId = (f.get('deseoId') as string | null) || null
  }
  const nombre: string = archivo?.name || 'libro sin nombre.epub'
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  const titulo =
    nombre
      .replace(/\.[^.]+$/, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Sin título'
  const l: EjemplarDTO = {
    id: id('ej'),
    archivoId: tipo === 'DOCUMENTO' ? 'demo-notas' : 'demo-faro',
    tipo,
    estado: 'POR_LEER',
    titulo,
    subtitulo: null,
    autores: [],
    anio: null,
    editorial: null,
    idioma: 'es',
    isbn: null,
    sinopsis: null,
    generos: [],
    etiquetas: [],
    calificacion: null,
    favorito: false,
    formatoOriginal: FORMATOS[ext] ?? 'EPUB',
    estadoConversion: 'PENDIENTE',
    tienePortada: false,
    minutosEstimados: null,
    porcentaje: 0,
    fechaLlegada: ahora(),
    ultimaApertura: null,
    fechaFin: null,
    nNotas: 0,
    fuenteMetadatos: 'NOMBRE_ARCHIVO',
  }
  /* Contrato v1.3.2 (BI-15): con deseoId el ejemplar hereda del deseo y el deseo se borra. */
  const deseo = deseoId ? db.libros.find((x) => x.id === deseoId && x.tipo === 'DESEO') : undefined
  if (deseo) {
    l.nota = deseo.nota ?? null
    l.etiquetas = [...deseo.etiquetas]
    l.favorito = deseo.favorito
    l.isbn = deseo.isbn
    db.libros = db.libros.filter((x) => x.id !== deseo.id)
  }
  db.libros.unshift(l)
  db.preparacion[l.id] = 0
  void config
  return ok([l])
}

/** Barra de progreso de subida creíble: 10 pasos en ~1 s. */
async function simularSubida(config: InternalAxiosRequestConfig) {
  const total = 1000
  for (let i = 1; i <= 10; i++) {
    await new Promise((r) => setTimeout(r, 90))
    config.onUploadProgress?.({
      loaded: (total * i) / 10,
      total,
      bytes: total / 10,
      lengthComputable: true,
    } as Parameters<NonNullable<InternalAxiosRequestConfig['onUploadProgress']>>[0])
  }
}

function audioEstado(cuerpo: { ejemplarId: string; vozId: string; capitulo: number }) {
  const l = libro(cuerpo.ejemplarId)
  if (!l || !l.archivoId) return fallo('No se encontró el libro.')
  if (l.archivoId !== 'demo-faro') {
    return ok({ estado: 'ERROR', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null })
  }
  const cap = cuerpo.capitulo
  if (cap < 0 || cap >= DURACIONES_DEMO.length) return fallo('Ese capítulo no existe.')
  const clave = `${cuerpo.vozId}|${cap}`
  const t = db.audioPedido[clave]
  if (!t) {
    db.audioPedido[clave] = Date.now()
    guardar()
    return ok({ estado: 'GENERANDO', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null })
  }
  if (Date.now() - t < 2500)
    return ok({ estado: 'GENERANDO', duracionSeg: null, url1x: null, url2x: null, urlTiempos: null })
  const b = `/demo/libros/demo-faro/audio/cap-${String(cap).padStart(3, '0')}`
  return ok({
    estado: 'LISTO',
    duracionSeg: DURACIONES_DEMO[cap],
    url1x: `${b}.wav`,
    url2x: `${b}-2x.wav`,
    urlTiempos: `${b}.tiempos.json`,
  })
}

// ---------------------------------------------------------------- Auth y administración
const usuarioDe = (email: string) => {
  const nombre = email.split('@')[0] || 'lector'
  const esSamy = /samy/i.test(email)
  return {
    token: `demo.${btoaSeguro(email)}.firma`,
    userId: esSamy ? '2' : '1',
    name: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    email,
    roles: esSamy ? ['USER'] : ['ADMIN', 'USER'],
  }
}
function btoaSeguro(s: string) {
  try {
    return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : s
  } catch {
    return s
  }
}

const ADMIN_USUARIOS = [
  { id: 1, name: 'Anderson', email: 'anderson@casa', alias: 'anderson', active: true, roles: ['ADMIN', 'USER'] },
  { id: 2, name: 'Samy', email: 'samy@casa', alias: 'samy', active: true, roles: ['USER'] },
]
const ROLES = [
  { id: 1, name: 'ADMIN', description: 'Administra usuarios y permisos', active: true, usuarios: 1 },
  { id: 2, name: 'USER', description: 'Lector de la biblioteca', active: true, usuarios: 2 },
]
const MODULOS = [
  {
    id: 1,
    code: 'BIBLIOTECA',
    name: 'Biblioteca',
    icon: 'book',
    sortOrder: 1,
    active: true,
    pages: [
      { id: 11, code: 'ESTANTERIA', name: 'Estantería', route: 'Biblioteca', inMenu: true, sortOrder: 1, active: true },
      { id: 12, code: 'LECTOR', name: 'Lector', route: 'Leer', inMenu: false, sortOrder: 2, active: true },
    ],
  },
  {
    id: 2,
    code: 'ADMIN',
    name: 'Administración',
    icon: 'settings',
    sortOrder: 9,
    active: true,
    pages: [
      { id: 21, code: 'USUARIOS', name: 'Usuarios', route: 'AdminUsers', inMenu: true, sortOrder: 1, active: true },
    ],
  },
]

// ---------------------------------------------------------------- Enrutador
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada ruta lee su cuerpo; la forma la fija el contrato §9
type Manejador = (m: RegExpMatchArray, cuerpo: any, config: InternalAxiosRequestConfig) => unknown | Promise<unknown>

const RUTAS: [RegExp, Manejador][] = [
  [
    /\/auth\/login$/,
    (_m, c) =>
      (c?.usuario || c?.email) && c?.password
        ? ok(
            usuarioDe(
              String(c.usuario || c.email)
                .trim()
                .toLowerCase(),
            ),
          )
        : fallo('Invalid email or password'),
  ],
  [
    /\/auth\/register$/,
    (_m, c) =>
      ok({
        ...usuarioDe(String(c?.email || 'nuevo@casa')),
        name: c?.name || 'Nuevo lector',
        alias: c?.alias || 'nuevo',
      }),
  ],
  /* v1.2: renovar el token (en la demo, el mismo usuario de la sesión). */
  [/\/auth\/renovar$/, () => ok(usuarioDe('anderson@casa'))],
  [
    /\/users\/get\/(.+)$/,
    (m) =>
      ok({
        id: m[1],
        name: m[1] === '2' ? 'Samy' : 'Anderson',
        email: m[1] === '2' ? 'samy@casa' : 'anderson@casa',
        active: true,
      }),
  ],
  [/\/admin\/users\/all$/, () => ok({ page: 0, size: 20, totalPage: 1, list: ADMIN_USUARIOS })],
  [/\/admin\/users\/get\/(\d+)$/, (m) => ok(ADMIN_USUARIOS.find((u) => String(u.id) === m[1]))],
  [/\/admin\/users\/save$/, (_m, c) => ok({ id: 3, active: true, roles: ['USER'], ...c })],
  [
    /\/admin\/users\/(\d+)\/roles$/,
    (m, c) => ok({ ...ADMIN_USUARIOS.find((u) => String(u.id) === m[1]), roles: c?.roles ?? [] }),
  ],
  [
    /\/admin\/users\/(\d+)\/(activate|deactivate)$/,
    (m) => ok({ ...ADMIN_USUARIOS.find((u) => String(u.id) === m[1]), active: m[2] === 'activate' }),
  ],
  [/\/admin\/roles\/all$/, () => ok(ROLES)],
  [/\/admin\/roles\/save$/, (_m, c) => ok({ id: 9, active: true, usuarios: 0, ...c })],
  [/\/admin\/roles\/delete\/(\d+)$/, (m) => ok({ ...ROLES.find((r) => String(r.id) === m[1]), active: false })],
  [/\/admin\/modules\/all$/, () => ok(MODULOS)],
  [/\/admin\/permissions\/save$/, (_m, c) => ok(c)],
  [
    /\/admin\/permissions\/([A-Z_]+)$/,
    () =>
      ok(
        MODULOS.flatMap((mo) =>
          mo.pages.map((p) => ({
            pageId: p.id,
            moduleCode: mo.code,
            pageCode: p.code,
            pageName: p.name,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: false,
          })),
        ),
      ),
  ],
  [
    /\/admin\/audit\/all$/,
    () =>
      ok({
        page: 0,
        size: 20,
        totalPage: 1,
        list: [
          {
            id: 1,
            actorUserId: 1,
            actorEmail: 'anderson@casa',
            entityType: 'USER',
            entityId: 2,
            action: 'ROLES',
            details: 'USER',
            occurredAt: ahora(),
          },
        ],
      }),
  ],

  // ---- Biblioteca
  [
    /\/libros\/subir$/,
    async (_m, c, config) => {
      await simularSubida(config)
      return subir(c, config)
    },
  ],
  [
    /\/libros\/deseo$/,
    (_m, c) => {
      if (!c?.titulo?.trim()) return fallo('El título es obligatorio.')
      const l: EjemplarDTO = {
        ...librosIniciales()[0],
        id: id('ej'),
        archivoId: null,
        tipo: 'DESEO',
        estado: 'POR_LEER',
        titulo: c.titulo.trim(),
        autores: c.autor ? [c.autor.trim()] : [],
        sinopsis: c.nota || null,
        isbn: c.isbn || null,
        generos: [],
        etiquetas: [],
        calificacion: null,
        favorito: false,
        formatoOriginal: null,
        estadoConversion: null,
        tienePortada: false,
        minutosEstimados: null,
        porcentaje: 0,
        fechaLlegada: ahora(),
        ultimaApertura: null,
        fechaFin: null,
        nNotas: 0,
        fuenteMetadatos: 'MANUAL',
        anio: null,
        editorial: null,
      }
      db.libros.unshift(l)
      return ok(l)
    },
  ],
  [
    /\/libros\/all$/,
    (_m, c) => {
      avanzarPreparacion()
      sincronizarFavoritos()
      return ok(consultar(db.libros, c || {}))
    },
  ],
  [
    /\/libros\/get\/(.+)$/,
    (m) => {
      avanzarPreparacion()
      sincronizarFavoritos()
      const l = libro(decodeURIComponent(m[1]))
      return l ? ok(detalle(l)) : fallo('No se encontró el libro.')
    },
  ],
  [
    /\/libros\/save$/,
    (_m, c) => {
      const l = libro(c?.id)
      if (!l) return fallo('No se encontró el libro.')
      const { favorito, ...resto } = c
      Object.entries(resto).forEach(([k, v]) => {
        if (v !== undefined && k !== 'id') (l as unknown as Record<string, unknown>)[k] = v
      })
      if (c.titulo || c.autores || c.anio !== undefined || c.sinopsis !== undefined) l.fuenteMetadatos = 'MANUAL'
      if (c.estado === 'LEIDO') {
        l.porcentaje = 100
        l.fechaFin = ahora()
      }
      if (typeof favorito === 'boolean') {
        const lista = (db.items[ESTANTE_FAVORITOS] ??= [])
        if (favorito && !lista.includes(l.id)) lista.push(l.id)
        if (!favorito) db.items[ESTANTE_FAVORITOS] = lista.filter((x) => x !== l.id)
      }
      sincronizarFavoritos()
      return ok(l)
    },
  ],
  [
    /\/libros\/delete\/(.+)$/,
    (m) => {
      const eid = decodeURIComponent(m[1])
      db.libros = db.libros.filter((l) => l.id !== eid)
      Object.keys(db.items).forEach((k) => (db.items[k] = db.items[k].filter((x) => x !== eid)))
      sincronizarFavoritos()
      return ok(true)
    },
  ],
  [/\/libros\/facetas$/, () => ok(facetas(db.libros))],

  [/\/progreso\/get\/(.+)$/, (m) => ok(db.progreso[decodeURIComponent(m[1])] ?? null)],
  [
    /\/progreso\/save$/,
    (_m, c: ProgresoDTO) => {
      const actual = db.progreso[c.ejemplarId]
      if (!actual || Date.parse(c.actualizadoEn) >= Date.parse(actual.actualizadoEn)) {
        db.progreso[c.ejemplarId] = c
        const l = libro(c.ejemplarId)
        if (l) {
          l.porcentaje = Math.round(c.porcentaje ?? l.porcentaje)
          l.ultimaApertura = ahora()
          if (l.estado === 'POR_LEER' && l.tipo === 'LIBRO') l.estado = 'LEYENDO'
        }
      }
      return ok(db.progreso[c.ejemplarId])
    },
  ],

  [/\/anotaciones\/all\/(.+)$/, (m) => ok(db.anotaciones.filter((a) => a.ejemplarId === decodeURIComponent(m[1])))],
  [
    /\/anotaciones\/save$/,
    (_m, c: AnotacionDTO) => {
      if (c.id) {
        const i = db.anotaciones.findIndex((a) => a.id === c.id)
        if (i >= 0) db.anotaciones[i] = { ...db.anotaciones[i], ...c, editado: ahora() }
        return ok(db.anotaciones[i])
      }
      const a = { ...c, id: id('an'), creado: ahora() }
      db.anotaciones.push(a)
      const l = libro(c.ejemplarId)
      if (l) l.nNotas = db.anotaciones.filter((x) => x.ejemplarId === l.id).length
      return ok(a)
    },
  ],
  [
    /\/anotaciones\/delete\/(.+)$/,
    (m) => {
      const aid = decodeURIComponent(m[1])
      const a = db.anotaciones.find((x) => x.id === aid)
      db.anotaciones = db.anotaciones.filter((x) => x.id !== aid)
      const l = a ? libro(a.ejemplarId) : undefined
      if (l) l.nNotas = db.anotaciones.filter((x) => x.ejemplarId === l.id).length
      return ok(true)
    },
  ],

  [
    /\/comentarios\/all\/(.+)$/,
    (m) =>
      ok(
        db.comentarios
          .filter((c) => c.ejemplarId === decodeURIComponent(m[1]))
          .sort((a, b) => (b.creado ?? '').localeCompare(a.creado ?? '')),
      ),
  ],
  [
    /\/comentarios\/save$/,
    (_m, c: ComentarioDTO) => {
      if (!c?.texto?.trim()) return fallo('El comentario está vacío.')
      const nuevo = { ...c, id: c.id ?? id('co'), creado: ahora() }
      db.comentarios = db.comentarios.filter((x) => x.id !== nuevo.id).concat(nuevo)
      return ok(nuevo)
    },
  ],
  [
    /\/comentarios\/delete\/(.+)$/,
    (m) => {
      db.comentarios = db.comentarios.filter((x) => x.id !== decodeURIComponent(m[1]))
      return ok(true)
    },
  ],

  [
    /\/estantes\/all$/,
    () => {
      sincronizarFavoritos()
      return ok(db.estantes)
    },
  ],
  [
    /\/estantes\/save$/,
    (_m, c) => {
      if (!c?.nombre?.trim()) return fallo('El estante necesita un nombre.')
      if (c.id) {
        const e = db.estantes.find((x) => x.id === c.id)
        if (e) Object.assign(e, { nombre: c.nombre.trim(), colorMadera: c.colorMadera ?? e.colorMadera })
        return ok(e)
      }
      const e: EstanteDTO = {
        id: id('est'),
        nombre: c.nombre.trim(),
        tipo: 'COLECCION',
        colorMadera: c.colorMadera ?? null,
        nLibros: 0,
      }
      db.estantes.push(e)
      db.items[e.id] = []
      return ok(e)
    },
  ],
  [
    /\/estantes\/delete\/(.+)$/,
    (m) => {
      const eid = decodeURIComponent(m[1])
      if (eid === ESTANTE_FAVORITOS) return fallo('El estante de favoritos no se puede borrar.')
      db.estantes = db.estantes.filter((e) => e.id !== eid)
      delete db.items[eid]
      return ok(true)
    },
  ],
  [
    /\/estantes\/([^/]+)\/libros$/,
    (m) => {
      sincronizarFavoritos()
      return ok((db.items[decodeURIComponent(m[1])] ?? []).map(libro).filter(Boolean))
    },
  ],
  [
    /\/estantes\/([^/]+)\/agregar$/,
    (m, c) => {
      const lista = (db.items[decodeURIComponent(m[1])] ??= [])
      if (!lista.includes(c.ejemplarId)) lista.push(c.ejemplarId)
      sincronizarFavoritos()
      return ok(true)
    },
  ],
  [
    /\/estantes\/([^/]+)\/quitar$/,
    (m, c) => {
      const k = decodeURIComponent(m[1])
      db.items[k] = (db.items[k] ?? []).filter((x) => x !== c.ejemplarId)
      sincronizarFavoritos()
      return ok(true)
    },
  ],
  [
    /\/estantes\/([^/]+)\/ordenar$/,
    (m, c) => {
      const k = decodeURIComponent(m[1])
      const lista = (db.items[k] ?? []).filter((x) => x !== c.ejemplarId)
      let pos = lista.length
      if (c.antesDe && lista.includes(c.antesDe)) pos = lista.indexOf(c.antesDe)
      else if (c.despuesDe && lista.includes(c.despuesDe)) pos = lista.indexOf(c.despuesDe) + 1
      lista.splice(pos, 0, c.ejemplarId)
      db.items[k] = lista
      return ok(true)
    },
  ],

  [/\/voces\/all$/, () => ok(VOCES_DEMO)],

  /* 0.4.0: sesiones (C4), preparar el libro (C5) y la casa (C6), simulados. */
  [
    /\/sesiones\/latido$/,
    (_m, c) => ok({ sesionId: c?.sesionId ?? 'demo-sesion', segundosTotales: Math.max(0, Number(c?.segundos) || 0) }),
  ],
  [
    /\/sesiones\/resumen$/,
    () => {
      const hoy = Date.now()
      const dias = [0, 1, 2, 4, 5, 9].map((n, i) => ({
        fecha: new Date(hoy - n * 86_400_000).toISOString().slice(0, 10),
        minutos: [25, 40, 12, 33, 18, 50][i],
      }))
      return ok({
        minutosLectura: 120,
        minutosVoz: 58,
        dias,
        rachaActual: 3,
        rachaMaxima: 5,
        libros: [{ ejemplarId: 'ej-guardian', minutos: 95 }],
      })
    },
  ],
  [
    /\/voz\/preparar-libro$/,
    (_m, c, config) =>
      config?.method === 'get' ? ok({ total: CAPITULOS_DEMO.length, listos: 2, enCola: 0, error: 0 }) : ok(true),
  ],
  [/\/estado-casa$/, () => ok({ taller: 'OK', traductor: 'OK', disco: 'OK', colaVoz: 0, mensaje: null })],
  [/\/audio\/estado$/, (_m, c) => audioEstado(c)],
]

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const adaptadorDemo: AxiosAdapter = async (config) => {
  const url = String(config.url || '').split('?')[0]
  let cuerpo: unknown = config.data
  if (typeof cuerpo === 'string') {
    try {
      cuerpo = JSON.parse(cuerpo)
    } catch {
      /* no era JSON */
    }
  }
  await espera(120 + Math.random() * 160)
  let data: unknown = { correct: false, message: `La demostración no conoce ${url}`, errorCode: 404, object: null }
  for (const [re, manejar] of RUTAS) {
    const m = url.match(re)
    if (m) {
      data = await manejar(m, cuerpo, config)
      break
    }
  }
  guardar()
  const respuesta: AxiosResponse = { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  return respuesta
}
