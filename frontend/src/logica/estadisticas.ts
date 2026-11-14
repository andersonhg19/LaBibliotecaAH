import { ZONA_HORARIA } from '@config'

/*
 * ESTADÍSTICAS DE LECTURA (F12, contrato C4). Funciones puras: las fechas del
 * periodo (en la hora de la casa, America/Bogota), los días que faltan en la
 * respuesta rellenados con 0 y los textos de la pantalla.
 */

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** AAAA-MM-DD de un instante en la hora de la casa. */
export const fechaCasa = (d: Date): string => fmtDia.format(d)

/** Los últimos `n` días que terminan hoy (hora de la casa): desde, hasta. */
export function periodo(n: number, ahora: Date = new Date()): { desde: string; hasta: string } {
  const hasta = fechaCasa(ahora)
  const desde = fechaCasa(new Date(ahora.getTime() - (n - 1) * 86_400_000))
  return { desde, hasta }
}

/** Todos los días del periodo, en orden, con sus minutos (0 si el servidor no lo trae). */
export function rellenarDias(
  dias: readonly { fecha: string; minutos: number }[],
  desde: string,
  hasta: string,
): { fecha: string; minutos: number }[] {
  const m = new Map(dias.map((d) => [d.fecha, Math.max(0, Math.round(d.minutos || 0))]))
  const fuera: { fecha: string; minutos: number }[] = []
  // Se recorre a mediodía UTC: ningún cambio de hora salta ni repite un día.
  const fin = Date.parse(`${hasta}T12:00:00Z`)
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= fin && fuera.length < 400; t += 86_400_000) {
    const fecha = new Date(t).toISOString().slice(0, 10)
    fuera.push({ fecha, minutos: m.get(fecha) ?? 0 })
  }
  return fuera
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «lun 3 nov» de un AAAA-MM-DD. */
export function diaLegible(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

/** «7 días seguidos», «1 día», «Sin racha todavía». */
export function textoRacha(n: number): string {
  if (!n || n <= 0) return 'Sin racha todavía'
  return n === 1 ? '1 día' : `${n} días seguidos`
}
