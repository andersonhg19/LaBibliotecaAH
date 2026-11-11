import { ZONA_HORARIA } from '@config'
import type { EjemplarDTO, EstadoLectura } from '@tipos'

/** "9 h 20 min", "45 min", "—" */
export function duracion(minutos: number | null | undefined): string {
  if (minutos == null || !Number.isFinite(minutos) || minutos <= 0) return '—'
  const m = Math.round(minutos)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} min`
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

/** 75.3 → "1:15", 3725 → "1:02:05" */
export function reloj(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.floor(segundos ?? 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const autoresTexto = (autores: string[] | null | undefined) =>
  autores && autores.length ? autores.join(', ') : 'Autor desconocido'

export const ESTADOS: { clave: EstadoLectura; nombre: string }[] = [
  { clave: 'POR_LEER', nombre: 'Por leer' },
  { clave: 'LEYENDO', nombre: 'Leyendo' },
  { clave: 'LEIDO', nombre: 'Leído' },
  { clave: 'ABANDONADO', nombre: 'Abandonado' },
]

export const nombreEstado = (e: EstadoLectura) => ESTADOS.find((x) => x.clave === e)?.nombre ?? e

/* Las fechas se muestran SIEMPRE en la hora de la casa (estándar 12), aunque
   el navegador esté en otra zona: "llegó hoy" significa hoy en Bogotá. */
const fmtCorta = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' })

/** "10 nov 2026" (en la zona de la casa). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return fmtCorta.format(d).replace(/\./g, '').replace(/ de /g, ' ')
}

/** "9:41 p. m." */
export function hora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtHora.format(d)
}

/** Días de calendario entre dos instantes, contados en la zona de la casa. */
const diaDe = (d: Date) => Date.parse(`${fmtDia.format(d)}T00:00:00Z`)

/** "hoy", "ayer", "hace 3 días", o la fecha corta. */
export function fechaRelativa(iso: string | null | undefined, ahora: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = Math.round((diaDe(ahora) - diaDe(d)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return fechaCorta(iso)
}

/** Si el ejemplar se está preparando en el taller (subido pero aún sin EPUB normalizado). */
export const seEstaPreparando = (l: Pick<EjemplarDTO, 'estadoConversion' | 'archivoId'>) =>
  !!l.archivoId && (l.estadoConversion === 'PENDIENTE' || l.estadoConversion === 'PROCESANDO')

/** Si se puede abrir en el lector. */
export const sePuedeLeer = (l: Pick<EjemplarDTO, 'estadoConversion' | 'archivoId' | 'tipo'>) =>
  l.tipo !== 'DESEO' && !!l.archivoId && l.estadoConversion === 'LISTO'
