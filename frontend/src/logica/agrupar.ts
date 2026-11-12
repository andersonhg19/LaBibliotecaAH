import { EstadoFiltros, FILTROS_INICIALES, leerFiltrosGuardados } from '@logica/filtros'
import type { EjemplarDTO } from '@tipos'

/*
 * LAS BALDAS POR TIPO. La estantería puede agrupar sus baldas por tus
 * colecciones (lo de siempre), por género o por autor. Todo se hace aquí, en
 * el cliente, con la lista de libros que ya da /libros/all: el backend no
 * cambia. Un libro con dos géneros (o dos autores) está en las dos baldas,
 * como en las facetas del catálogo: así lo encuentras busques por donde
 * busques. Lo que no tiene género (o autor) va a su balda propia, al final.
 */

export type Agrupacion = 'COLECCIONES' | 'GENERO' | 'AUTOR'
export type OrdenBaldas = 'CANTIDAD' | 'ALFABETICO'

export const AGRUPACIONES: { clave: Agrupacion; nombre: string }[] = [
  { clave: 'COLECCIONES', nombre: 'Colecciones' },
  { clave: 'GENERO', nombre: 'Géneros' },
  { clave: 'AUTOR', nombre: 'Autores' },
]

export const ORDENES_BALDAS: { clave: OrdenBaldas; nombre: string }[] = [
  { clave: 'CANTIDAD', nombre: 'Las más llenas primero' },
  { clave: 'ALFABETICO', nombre: 'De la A a la Z' },
]

export const SIN_GENERO = 'Sin género'
export const SIN_AUTOR = 'Sin autor'

export interface Grupo {
  /** Clave estable (nombre normalizado) para el id de la balda. */
  clave: string
  nombre: string
  libros: EjemplarDTO[]
  /** La balda de los que no tienen género/autor. */
  resto: boolean
}

/** Normaliza para agrupar: sin mayúsculas, sin tildes y sin espacios de más ("García Márquez" = "garcia  marquez"). */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

const comparar = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })

/**
 * Agrupa los libros en baldas. `soloEstos` (los géneros o autores por los que
 * se filtra) deja solo esas baldas: si filtras «Novela» agrupando por género,
 * no aparece «Realismo mágico» solo porque Cien años es de los dos.
 */
export function agruparLibros(
  libros: EjemplarDTO[],
  por: Exclude<Agrupacion, 'COLECCIONES'>,
  orden: OrdenBaldas,
  soloEstos: string[] = [],
): Grupo[] {
  const grupos = new Map<string, Grupo>()
  const resto: EjemplarDTO[] = []
  const filtro = new Set(soloEstos.map(normalizar))
  for (const l of libros) {
    const valores = (por === 'GENERO' ? l.generos : l.autores) ?? []
    const limpios = valores.map((v) => v.trim()).filter(Boolean)
    if (!limpios.length) {
      resto.push(l)
      continue
    }
    const vistos = new Set<string>()
    for (const v of limpios) {
      const clave = normalizar(v)
      if (vistos.has(clave) || (filtro.size && !filtro.has(clave))) continue
      vistos.add(clave)
      const g = grupos.get(clave) ?? { clave, nombre: v, libros: [], resto: false }
      g.libros.push(l)
      grupos.set(clave, g)
    }
  }
  const porTitulo = (a: EjemplarDTO, b: EjemplarDTO) => comparar(a.titulo, b.titulo)
  const lista = [...grupos.values()].map((g) => ({ ...g, libros: [...g.libros].sort(porTitulo) }))
  lista.sort((a, b) =>
    orden === 'CANTIDAD'
      ? b.libros.length - a.libros.length || comparar(a.nombre, b.nombre)
      : comparar(a.nombre, b.nombre),
  )
  if (resto.length && !filtro.size) {
    const nombre = por === 'GENERO' ? SIN_GENERO : SIN_AUTOR
    lista.push({ clave: `_${normalizar(nombre)}`, nombre, libros: [...resto].sort(porTitulo), resto: true })
  }
  return lista
}

/** Lo que se recuerda de la estantería, por usuario. */
export interface PreferenciasEstanteria {
  agrupar: Agrupacion
  orden: OrdenBaldas
  /** Solo se usan autores, géneros y formatos (el resto de EstadoFiltros queda en su valor inicial). */
  filtros: EstadoFiltros
}

export const PREFERENCIAS_INICIALES: PreferenciasEstanteria = {
  agrupar: 'COLECCIONES',
  orden: 'CANTIDAD',
  filtros: FILTROS_INICIALES,
}

/** Clave de almacenamiento, por usuario (Anderson y Samy comparten PC), como los filtros del catálogo. */
export const claveEstanteria = (userId: string | number | undefined | null) =>
  `@biblioteca_ah_estanteria_${userId ?? 'anonimo'}`

/** Deja en los filtros de la estantería solo lo que la estantería filtra. */
export const filtrosDeEstanteria = (f: EstadoFiltros): EstadoFiltros => ({
  ...FILTROS_INICIALES,
  autores: f.autores,
  generos: f.generos,
  formatos: f.formatos,
})

/** Lee lo guardado sin fiarse: lo que no se reconoce cae al valor inicial. */
export function leerPreferenciasEstanteria(json: string | null | undefined): PreferenciasEstanteria {
  if (!json) return PREFERENCIAS_INICIALES
  try {
    const g = JSON.parse(json)
    if (!g || typeof g !== 'object') return PREFERENCIAS_INICIALES
    return {
      agrupar: AGRUPACIONES.some((a) => a.clave === g.agrupar) ? g.agrupar : 'COLECCIONES',
      orden: ORDENES_BALDAS.some((o) => o.clave === g.orden) ? g.orden : 'CANTIDAD',
      filtros: filtrosDeEstanteria(leerFiltrosGuardados(JSON.stringify(g.filtros ?? null))),
    }
  } catch {
    return PREFERENCIAS_INICIALES
  }
}
