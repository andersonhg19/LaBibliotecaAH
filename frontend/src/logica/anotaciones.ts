import type { AnotacionDTO } from '@tipos'

/*
 * Colores de resaltado (plan §7.2). Cada uno tiene NOMBRE: en la lista de
 * notas se dice "Ámbar" además de pintarlo (nada solo por color).
 */
export const COLORES_RESALTADO = [
  { clave: 'ambar', nombre: 'Ámbar', hex: '#D9A35B' },
  { clave: 'salvia', nombre: 'Verde salvia', hex: '#9DB89A' },
  { clave: 'tinta', nombre: 'Azul tinta', hex: '#7FA3C9' },
  { clave: 'rosa', nombre: 'Rosa viejo', hex: '#C99AA3' },
  { clave: 'lavanda', nombre: 'Lavanda', hex: '#B3A6D1' },
] as const

export const nombreColor = (hex: string | null | undefined) =>
  COLORES_RESALTADO.find((c) => c.hex.toLowerCase() === (hex ?? '').toLowerCase())?.nombre ?? 'Ámbar'

/** Contexto para la tercera ancla (cita + 32 caracteres antes y después, selector W3C). */
export const LARGO_CONTEXTO = 32

export function contextoDeCita(
  textoCompleto: string,
  inicio: number,
  fin: number,
): { prefijo: string; sufijo: string } {
  return {
    prefijo: textoCompleto.slice(Math.max(0, inicio - LARGO_CONTEXTO), inicio),
    sufijo: textoCompleto.slice(fin, fin + LARGO_CONTEXTO),
  }
}

/** Orden de lectura: por capítulo y luego por frase/offset de inicio. */
export function ordenarAnotaciones(lista: AnotacionDTO[]): AnotacionDTO[] {
  return [...lista].sort(
    (a, b) =>
      (a.capitulo ?? 0) - (b.capitulo ?? 0) ||
      (a.fraseInicio ?? '').localeCompare(b.fraseInicio ?? '') ||
      (a.offsetInicio ?? 0) - (b.offsetInicio ?? 0),
  )
}

/** Nombre del tipo para la lista. */
export const nombreTipo = (a: AnotacionDTO) =>
  a.tipo === 'NOTA' ? 'Nota' : a.tipo === 'MARCADOR' ? 'Marcador' : 'Resaltado'
