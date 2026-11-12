import type { EjemplarDTO, Formato } from '@tipos'

/*
 * QUÉ SE ABRE CON QUÉ (contrato v1.6).
 *
 * Las hojas de cálculo (XLSX, XLS, ODS, CSV) no tienen sentido como libro: el
 * taller las deja en hoja.json y se abren en el visor de hojas. Todo lo demás
 * (EPUB, PDF, Word, Markdown, HTML…) se convierte al EPUB normalizado y se lee
 * en el lector, con voz, notas y traducción.
 */
export const FORMATOS_HOJA: readonly Formato[] = ['XLSX', 'XLS', 'ODS', 'CSV']

export const esHojaDeCalculo = (formato: Formato | string | null | undefined): boolean =>
  !!formato && (FORMATOS_HOJA as readonly string[]).includes(formato.toUpperCase())

export type DestinoAlAbrir =
  | { ruta: 'Hoja'; params: { id: string } }
  | { ruta: 'Leer'; params: { id: string } }
  | {
      ruta: 'Libro'
      params: { id: string }
    }

/**
 * Adónde lleva tocar un documento: el visor de hojas o el lector si está
 * listo; la ficha si aún se prepara, falló o no tiene archivo (ahí se explica
 * por qué y se puede reintentar).
 */
export function destinoAlAbrir(
  e: Pick<EjemplarDTO, 'id' | 'tipo' | 'archivoId' | 'estadoConversion' | 'formatoOriginal'>,
): DestinoAlAbrir {
  const listo = e.tipo !== 'DESEO' && !!e.archivoId && e.estadoConversion === 'LISTO'
  if (!listo) return { ruta: 'Libro', params: { id: e.id } }
  return esHojaDeCalculo(e.formatoOriginal)
    ? { ruta: 'Hoja', params: { id: e.id } }
    : { ruta: 'Leer', params: { id: e.id } }
}
