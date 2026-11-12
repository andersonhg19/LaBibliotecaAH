import { plural } from '@logica/formato'
import type { CarpetaDTO, Formato } from '@tipos'

/*
 * EL ARCHIVADOR (contrato v1.6): lógica pura de carpetas y tipos de archivo,
 * sin React, para probarla sola.
 */

export type FamiliaArchivo = 'libro' | 'pdf' | 'texto' | 'hoja' | 'presentacion' | 'codigo'

export interface TipoDeArchivo {
  familia: FamiliaArchivo
  /** Lo que se lee en la etiqueta del icono (XLSX, MD…). */
  etiqueta: string
  /** Para el lector de pantalla: «hoja de cálculo», «documento de texto»… */
  nombre: string
  /** Color de la etiqueta; el texto va en marfil encima (contraste ≥ 4.5:1 medido en las pruebas). */
  color: string
}

const FAMILIAS: Record<FamiliaArchivo, { nombre: string; color: string }> = {
  libro: { nombre: 'libro electrónico', color: '#7A4A22' },
  pdf: { nombre: 'PDF', color: '#6B1F2A' },
  texto: { nombre: 'documento de texto', color: '#2E4A6B' },
  hoja: { nombre: 'hoja de cálculo', color: '#2F4A3A' },
  presentacion: { nombre: 'presentación', color: '#8E4A22' },
  codigo: { nombre: 'archivo de datos', color: '#3D3A4A' },
}

const FAMILIA_DE: Record<Formato, FamiliaArchivo> = {
  EPUB: 'libro',
  PDF: 'pdf',
  DOCX: 'texto',
  DOC: 'texto',
  ODT: 'texto',
  RTF: 'texto',
  TXT: 'texto',
  MD: 'texto',
  HTML: 'codigo',
  JSON: 'codigo',
  YAML: 'codigo',
  LOG: 'codigo',
  PPTX: 'presentacion',
  XLSX: 'hoja',
  XLS: 'hoja',
  ODS: 'hoja',
  CSV: 'hoja',
}

/** Familia, etiqueta y color del icono de un archivo según su formato (sin formato: texto). */
export function tipoDeArchivo(formato: Formato | string | null | undefined): TipoDeArchivo {
  const f = (formato ?? '').toUpperCase() as Formato
  const familia = FAMILIA_DE[f] ?? 'texto'
  return { familia, etiqueta: f || 'DOC', ...FAMILIAS[familia] }
}

export const COLORES_DE_FAMILIA = Object.values(FAMILIAS).map((f) => f.color)

/** «3 documentos · 2 carpetas», «Vacía». */
export function cuentaDeCarpeta(c: Pick<CarpetaDTO, 'nDocumentos' | 'nSubcarpetas'>): string {
  const partes: string[] = []
  if (c.nDocumentos > 0) partes.push(plural(c.nDocumentos, 'documento'))
  if (c.nSubcarpetas > 0) partes.push(plural(c.nSubcarpetas, 'carpeta'))
  return partes.length ? partes.join(' · ') : 'Vacía'
}

export interface CarpetaEnArbol extends CarpetaDTO {
  nivel: number
}

/**
 * Las carpetas (en el orden de /carpetas/all: en profundidad, hermanas por
 * nombre) con su nivel de sangría. Si se va a mover una carpeta, se quitan ella
 * y todo lo suyo: no puede entrar en sí misma.
 */
export function arbolPlano(carpetas: CarpetaDTO[], sinElSubarbolDe?: string | null): CarpetaEnArbol[] {
  const porId = new Map(carpetas.map((c) => [c.id, c]))
  const nivel = (c: CarpetaDTO): number => {
    let n = 0
    let p = c.padreId
    const vistos = new Set<string>()
    while (p && porId.has(p) && !vistos.has(p)) {
      vistos.add(p)
      n++
      p = porId.get(p)?.padreId ?? null
    }
    return n
  }
  const dentroDe = (c: CarpetaDTO, raiz: string): boolean => {
    let p: string | null = c.id
    const vistos = new Set<string>()
    while (p && !vistos.has(p)) {
      if (p === raiz) return true
      vistos.add(p)
      p = porId.get(p)?.padreId ?? null
    }
    return false
  }
  return carpetas
    .filter((c) => !sinElSubarbolDe || !dentroDe(c, sinElSubarbolDe))
    .map((c) => ({ ...c, nivel: nivel(c) }))
}

/** Lo que se pide al borrar una carpeta: nada si está vacía; si no, hay que elegir. */
export const carpetaVacia = (c: Pick<CarpetaDTO, 'nDocumentos' | 'nSubcarpetas'>) =>
  c.nDocumentos === 0 && c.nSubcarpetas === 0

/**
 * Adónde sube lo de dentro al borrar una carpeta: su carpeta de arriba («Proyectos»)
 * o la raíz. `nombreDe` da el nombre de una carpeta por su id (de las migas o de las
 * ubicaciones de una búsqueda, "Obra / Planos" → "Planos").
 */
export function destinoAlBorrar(padreId: string | null, nombreDe: (id: string) => string | undefined): string {
  if (!padreId) return 'la raíz del archivador'
  const nombre = nombreDe(padreId)?.split(' / ').pop()
  return nombre ? `«${nombre}»` : 'la carpeta de arriba'
}
