import type { EjemplarDTO, FacetasDTO, FiltroLibrosDTO, PageDTO } from '@tipos'

/*
 * Lo que hace biblioteca-service con FiltroLibrosDTO, reproducido en memoria
 * para el modo demostración. También sirve de especificación ejecutable de lo
 * que la pantalla espera del servidor (ver consulta.test.ts).
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function cumplePestana(l: EjemplarDTO, p: FiltroLibrosDTO['pestana']): boolean {
  switch (p) {
    case 'LEYENDO':
      return l.tipo === 'LIBRO' && l.estado === 'LEYENDO'
    case 'POR_LEER':
      return l.tipo === 'LIBRO' && l.estado === 'POR_LEER'
    case 'LEIDOS':
      return l.tipo === 'LIBRO' && l.estado === 'LEIDO'
    case 'FAVORITOS':
      return l.favorito
    case 'DESEOS':
      return l.tipo === 'DESEO'
    case 'DOCUMENTOS':
      return l.tipo === 'DOCUMENTO'
    case 'TODO':
    default:
      return true
  }
}

export function cumpleFiltro(l: EjemplarDTO, f: FiltroLibrosDTO): boolean {
  if (!cumplePestana(l, f.pestana)) return false
  if (f.texto) {
    const t = norm(f.texto)
    const enTexto = [l.titulo, l.subtitulo ?? '', ...l.autores, l.sinopsis ?? '', ...l.etiquetas, ...l.generos].some(
      (x) => norm(x).includes(t),
    )
    if (!enTexto) return false
  }
  if (f.autores?.length && !l.autores.some((a) => f.autores!.includes(a))) return false
  if (f.generos?.length && !l.generos.some((g) => f.generos!.includes(g))) return false
  if (f.etiquetas?.length && !l.etiquetas.some((g) => f.etiquetas!.includes(g))) return false
  if (f.formatos?.length && (!l.formatoOriginal || !f.formatos.includes(l.formatoOriginal))) return false
  if (f.anioDesde != null && (l.anio == null || l.anio < f.anioDesde)) return false
  if (f.anioHasta != null && (l.anio == null || l.anio > f.anioHasta)) return false
  if (f.calificacionMin != null && (l.calificacion == null || l.calificacion < f.calificacionMin)) return false
  if (f.conNotas && !(l.nNotas > 0)) return false
  return true
}

const fecha = (s: string | null) => (s ? Date.parse(s) : 0)
const textoOrden = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })

export function comparador(orden: FiltroLibrosDTO['orden']): (a: EjemplarDTO, b: EjemplarDTO) => number {
  switch (orden) {
    case 'ANTIGUOS':
      return (a, b) => fecha(a.fechaLlegada) - fecha(b.fechaLlegada)
    case 'ULTIMO_ABIERTO':
      return (a, b) =>
        fecha(b.ultimaApertura) - fecha(a.ultimaApertura) || fecha(b.fechaLlegada) - fecha(a.fechaLlegada)
    case 'TITULO':
      return (a, b) => textoOrden(a.titulo, b.titulo)
    case 'AUTOR':
      return (a, b) => textoOrden(a.autores[0] ?? '￿', b.autores[0] ?? '￿') || textoOrden(a.titulo, b.titulo)
    case 'ANIO':
      return (a, b) => (a.anio ?? 99999) - (b.anio ?? 99999)
    case 'PROGRESO':
      return (a, b) => b.porcentaje - a.porcentaje
    case 'CALIFICACION':
      return (a, b) => (b.calificacion ?? -1) - (a.calificacion ?? -1)
    case 'RECIENTES':
    default:
      return (a, b) => fecha(b.fechaLlegada) - fecha(a.fechaLlegada)
  }
}

export function consultar(libros: EjemplarDTO[], f: FiltroLibrosDTO): PageDTO<EjemplarDTO> {
  const size = Math.max(1, f.size ?? 30)
  const page = Math.max(0, f.page ?? 0)
  const todos = libros.filter((l) => cumpleFiltro(l, f)).sort(comparador(f.orden))
  return {
    page,
    size,
    totalElements: todos.length,
    totalPage: Math.max(1, Math.ceil(todos.length / size)),
    list: todos.slice(page * size, page * size + size),
  }
}

export function facetas(libros: EjemplarDTO[]): FacetasDTO {
  const contar = (valores: (string | number | null | undefined)[]) => {
    const m = new Map<string, number>()
    valores.forEach((v) => {
      if (v == null || v === '') return
      const k = String(v)
      m.set(k, (m.get(k) ?? 0) + 1)
    })
    return [...m.entries()]
      .map(([nombre, n]) => ({ nombre, n }))
      .sort((a, b) => b.n - a.n || textoOrden(a.nombre, b.nombre))
  }
  return {
    autores: contar(libros.flatMap((l) => l.autores)),
    generos: contar(libros.flatMap((l) => l.generos)),
    anios: contar(libros.map((l) => l.anio)).sort((a, b) => Number(a.nombre) - Number(b.nombre)),
    formatos: contar(libros.map((l) => l.formatoOriginal)),
    etiquetas: contar(libros.flatMap((l) => l.etiquetas)),
  }
}
