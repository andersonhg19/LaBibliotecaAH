import type { ModoLector, Preferencias } from '@contextos/PreferenciasContext'

/*
 * CÓMO SE LEE EN ESTA VENTANA. Tres maneras, elegidas en «Leer a tu manera»:
 *   · Pasar páginas            una página, se pasa de lado (teléfono, por defecto);
 *   · Hojas                    hojas de papel una debajo de otra, con su largo real,
 *                              y se avanza desplazando (rueda o dedo);
 *   · Libro abierto            dos páginas lado a lado (solo en una pantalla ancha).
 * Lo elegido se recuerda en este dispositivo. Si nunca se eligió, se decide por
 * la ventana: en un PC bajo y ancho (1915×730, 1366×650) las Hojas, que usan todo
 * el alto; en un PC normal, el libro abierto; en el teléfono, pasar páginas.
 */

/** Desde este ancho (y en horizontal) caben dos páginas. Igual que LECTOR_PAPEL.anchoDosColumnas. */
export const ANCHO_LIBRO_ABIERTO = 1100

export const cabeLibroAbierto = (ancho: number, alto: number) => ancho >= ANCHO_LIBRO_ABIERTO && ancho > alto

/** Una ventana de PC baja y ancha: dos páginas quedarían cortas y apaisadas. */
export const ventanaBajaYAncha = (ancho: number, alto: number) =>
  cabeLibroAbierto(ancho, alto) && alto < 820 && ancho / alto >= 1.75

export function modoEfectivo(p: Pick<Preferencias, 'modo' | 'modoElegido'>, ancho: number, alto: number): ModoLector {
  if (p.modoElegido) return p.modo === 'libro' && !cabeLibroAbierto(ancho, alto) ? 'paginado' : p.modo
  if (ventanaBajaYAncha(ancho, alto)) return 'continuo'
  if (cabeLibroAbierto(ancho, alto)) return 'libro'
  return 'paginado'
}

export interface OpcionModo {
  modo: ModoLector
  nombre: string
  detalle: string
}

/** Las opciones en el orden en que se ofrecen: en un PC bajo y ancho, las Hojas primero. */
export function opcionesDeModo(ancho: number, alto: number): OpcionModo[] {
  const paginas: OpcionModo = { modo: 'paginado', nombre: 'Pasar páginas', detalle: 'Una página; se pasa de lado' }
  const hojas: OpcionModo = {
    modo: 'continuo',
    nombre: 'Hojas',
    detalle: 'Desplazamiento vertical, una hoja debajo de otra',
  }
  const libro: OpcionModo = { modo: 'libro', nombre: 'Libro abierto', detalle: 'Dos páginas, como un libro en la mesa' }
  if (!cabeLibroAbierto(ancho, alto)) return [paginas, hojas]
  return ventanaBajaYAncha(ancho, alto) ? [hojas, libro, paginas] : [libro, hojas, paginas]
}
