import type { TemaPapel } from '@contextos/PreferenciasContext'

/*
 * LOS PAPELES DEL LECTOR (plan §7.1). El texto de lectura se mide con AAA
 * (7:1, estándar 30): se leen horas seguidas, no un rótulo.
 */
export const PAPELES: Record<
  TemaPapel,
  { nombre: string; fondo: string; tinta: string; enlace: string; seleccion: string }
> = {
  marfil: {
    nombre: 'Marfil',
    fondo: '#FBF7EE',
    tinta: '#2B1A10',
    enlace: '#7A3B1E',
    seleccion: 'rgba(217,163,91,0.45)',
  },
  pergamino: {
    nombre: 'Pergamino',
    fondo: '#F1E4C6',
    tinta: '#33200F',
    enlace: '#6B1F2A',
    seleccion: 'rgba(181,101,58,0.35)',
  },
  noche: { nombre: 'Noche', fondo: '#1C110A', tinta: '#E9DDC2', enlace: '#E8C877', seleccion: 'rgba(217,163,91,0.38)' },
}
