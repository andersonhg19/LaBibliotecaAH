import type { AnotacionDTO, EjemplarDTO, TipoAnotacion } from '@tipos'

/*
 * MIS NOTAS: filtrar, buscar y ordenar las anotaciones de todos los libros.
 * Lógica pura (la pantalla solo pinta): se prueba sin montar nada.
 */

export interface GrupoNotas {
  libro: EjemplarDTO
  notas: AnotacionDTO[]
}

export interface FiltroNotas {
  texto: string
  /** Hex del color, o null = todos. */
  color: string | null
  /** RESALTADO (subrayado), NOTA, MARCADOR, o null = todos. */
  tipo: TipoAnotacion | null
}

export const FILTRO_NOTAS_INICIAL: FiltroNotas = { texto: '', color: null, tipo: null }

/** Sin tildes ni mayúsculas: "Lámpara" se encuentra escribiendo "lampara". */
export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function cumpleFiltro(a: AnotacionDTO, libro: EjemplarDTO, f: FiltroNotas): boolean {
  if (f.tipo && a.tipo !== f.tipo) return false
  if (f.color && (a.color ?? '').toLowerCase() !== f.color.toLowerCase()) return false
  const q = normalizar(f.texto.trim())
  if (!q) return true
  return [a.textoCitado, a.nota, libro.titulo, ...(libro.autores ?? [])].some((x) => x && normalizar(x).includes(q))
}

/** Los grupos con solo lo que pasa el filtro (y sin grupos vacíos). */
export function filtrarGrupos(grupos: GrupoNotas[], f: FiltroNotas): GrupoNotas[] {
  return grupos
    .map((g) => ({ libro: g.libro, notas: g.notas.filter((a) => cumpleFiltro(a, g.libro, f)) }))
    .filter((g) => g.notas.length > 0)
}

/** Vista "Todas": cada nota con su libro, de la más nueva a la más vieja. */
export function porFecha(grupos: GrupoNotas[]): { libro: EjemplarDTO; nota: AnotacionDTO }[] {
  return grupos
    .flatMap((g) => g.notas.map((nota) => ({ libro: g.libro, nota })))
    .sort((a, b) => (b.nota.creado ?? '').localeCompare(a.nota.creado ?? ''))
}

/** La cita lista para copiar o compartir: «…» — Autor, Título. */
export function citaParaCompartir(a: AnotacionDTO, libro: EjemplarDTO): string {
  const autor = libro.autores?.length ? `${libro.autores.join(', ')}, ` : ''
  const cita = a.textoCitado ? `«${a.textoCitado.trim()}»\n— ${autor}${libro.titulo}` : `${libro.titulo}`
  return a.nota ? `${cita}\n\nMi nota: ${a.nota.trim()}` : cita
}

/** Cuántas notas hay en total en unos grupos. */
export const totalNotas = (grupos: GrupoNotas[]) => grupos.reduce((n, g) => n + g.notas.length, 0)
