import type { FiltroLibrosDTO, Orden, Pestana } from '@tipos'

/*
 * LOS FILTROS DEL CATÁLOGO.
 *
 * El estado de la pantalla es uno solo (EstadoFiltros) y de él salen tres
 * cosas: el cuerpo que se manda a /v1/libros/all, los chips que se pintan
 * (cada uno sabe quitarse a sí mismo) y lo que se guarda por usuario para que
 * al volver la biblioteca esté como la dejó.
 */

export interface EstadoFiltros {
  pestana: Pestana
  texto: string
  autores: string[]
  generos: string[]
  formatos: string[]
  etiquetas: string[]
  anioDesde: number | null
  anioHasta: number | null
  calificacionMin: number | null
  conNotas: boolean
  orden: Orden
}

export const FILTROS_INICIALES: EstadoFiltros = {
  pestana: 'TODO',
  texto: '',
  autores: [],
  generos: [],
  formatos: [],
  etiquetas: [],
  anioDesde: null,
  anioHasta: null,
  calificacionMin: null,
  conNotas: false,
  orden: 'RECIENTES',
}

/* "Todo" va PRIMERO (UX-01): es la pestaña por defecto y, al final de la fila,
   quedaba fuera de la pantalla del teléfono sin que se viera cuál estaba activa. */
export const PESTANAS: { clave: Pestana; nombre: string }[] = [
  { clave: 'TODO', nombre: 'Todo' },
  { clave: 'LEYENDO', nombre: 'Leyendo' },
  { clave: 'POR_LEER', nombre: 'Por leer' },
  { clave: 'LEIDOS', nombre: 'Leídos' },
  { clave: 'FAVORITOS', nombre: 'Favoritos' },
  { clave: 'DESEOS', nombre: 'Deseos' },
  { clave: 'DOCUMENTOS', nombre: 'Documentos' },
]

export const ORDENES: { clave: Orden; nombre: string }[] = [
  { clave: 'RECIENTES', nombre: 'Recién llegados' },
  { clave: 'ANTIGUOS', nombre: 'Llegados hace más tiempo' },
  { clave: 'ULTIMO_ABIERTO', nombre: 'Último abierto' },
  { clave: 'TITULO', nombre: 'Título' },
  { clave: 'AUTOR', nombre: 'Autor' },
  { clave: 'ANIO', nombre: 'Año' },
  { clave: 'PROGRESO', nombre: 'Progreso' },
  { clave: 'CALIFICACION', nombre: 'Calificación' },
]

export const TAMANO_PAGINA = 30

/** El cuerpo de /v1/libros/all: solo lo que filtra de verdad (sin listas vacías ni nulos). */
export function aFiltroDTO(e: EstadoFiltros, page = 0, size = TAMANO_PAGINA): FiltroLibrosDTO {
  const f: FiltroLibrosDTO = { pestana: e.pestana, orden: e.orden, page, size }
  const texto = e.texto.trim()
  if (texto) f.texto = texto
  if (e.autores.length) f.autores = [...e.autores]
  if (e.generos.length) f.generos = [...e.generos]
  if (e.formatos.length) f.formatos = [...e.formatos]
  if (e.etiquetas.length) f.etiquetas = [...e.etiquetas]
  if (e.anioDesde != null) f.anioDesde = e.anioDesde
  if (e.anioHasta != null) f.anioHasta = e.anioHasta
  if (e.calificacionMin != null) f.calificacionMin = e.calificacionMin
  if (e.conNotas) f.conNotas = true
  return f
}

/** Pone o quita un valor de una lista (chip de selección múltiple). */
export function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}

export interface Chip {
  clave: string
  etiqueta: string
  quitar: (e: EstadoFiltros) => EstadoFiltros
}

/** Los filtros activos como chips (la pestaña, el orden y el texto no cuentan: tienen su propio control). */
export function chipsActivos(e: EstadoFiltros): Chip[] {
  const chips: Chip[] = []
  const lista = (campo: 'autores' | 'generos' | 'formatos' | 'etiquetas', prefijo: string) =>
    e[campo].forEach((v) =>
      chips.push({
        clave: `${campo}:${v}`,
        etiqueta: `${prefijo}${v}`,
        quitar: (x) => ({ ...x, [campo]: x[campo].filter((y) => y !== v) }),
      }),
    )
  lista('autores', '')
  lista('generos', '')
  lista('formatos', '')
  lista('etiquetas', '#')
  if (e.anioDesde != null || e.anioHasta != null) {
    const desde = e.anioDesde ?? '…'
    const hasta = e.anioHasta ?? '…'
    chips.push({
      clave: 'anio',
      etiqueta:
        e.anioDesde != null && e.anioHasta != null && e.anioDesde === e.anioHasta
          ? `Año ${desde}`
          : `Años ${desde}–${hasta}`,
      quitar: (x) => ({ ...x, anioDesde: null, anioHasta: null }),
    })
  }
  if (e.calificacionMin != null) {
    chips.push({
      clave: 'calificacion',
      etiqueta: `${e.calificacionMin}★ o más`,
      quitar: (x) => ({ ...x, calificacionMin: null }),
    })
  }
  if (e.conNotas) chips.push({ clave: 'notas', etiqueta: 'Con notas', quitar: (x) => ({ ...x, conNotas: false }) })
  return chips
}

export const contarFiltros = (e: EstadoFiltros) => chipsActivos(e).length

/** Quita los filtros (no la pestaña ni el orden: esos son "dónde estoy", no "qué busco"). */
export const limpiarFiltros = (e: EstadoFiltros): EstadoFiltros => ({
  ...FILTROS_INICIALES,
  pestana: e.pestana,
  orden: e.orden,
})

/** Clave de almacenamiento: los filtros se recuerdan POR USUARIO (Anderson y Samy comparten PC). */
export const claveFiltros = (userId: string | number | undefined | null) =>
  `@biblioteca_ah_filtros_${userId ?? 'anonimo'}`

const esListaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const esNumeroONulo = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))

/**
 * Lee lo guardado sin fiarse: un valor viejo o corrupto no puede romper la
 * biblioteca. Lo que no se reconoce cae al valor inicial.
 */
export function leerFiltrosGuardados(json: string | null | undefined): EstadoFiltros {
  if (!json) return FILTROS_INICIALES
  try {
    const g = JSON.parse(json)
    if (!g || typeof g !== 'object') return FILTROS_INICIALES
    const r: EstadoFiltros = { ...FILTROS_INICIALES }
    if (PESTANAS.some((p) => p.clave === g.pestana)) r.pestana = g.pestana
    if (ORDENES.some((o) => o.clave === g.orden)) r.orden = g.orden
    if (typeof g.texto === 'string') r.texto = g.texto
    ;(['autores', 'generos', 'formatos', 'etiquetas'] as const).forEach((c) => {
      if (esListaDeTexto(g[c])) r[c] = g[c]
    })
    ;(['anioDesde', 'anioHasta', 'calificacionMin'] as const).forEach((c) => {
      if (esNumeroONulo(g[c])) r[c] = g[c]
    })
    if (typeof g.conNotas === 'boolean') r.conNotas = g.conNotas
    return r
  } catch {
    return FILTROS_INICIALES
  }
}
