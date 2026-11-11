/*
 * ORDEN MANUAL DE UN ESTANTE (Favoritos, plan §8.4).
 *
 * El servidor guarda un índice fraccional: para mover un libro solo necesita
 * saber entre cuáles dos queda. Por eso, al soltar, se calcula la lista nueva
 * y de ella los vecinos del libro movido:
 *   despuesDe = el que queda a su izquierda (antes en la lista),
 *   antesDe   = el que queda a su derecha (después en la lista).
 * En los extremos falta uno de los dos, y se omite.
 */

export function mover<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  const r = [...lista]
  if (desde < 0 || desde >= r.length) return r
  const destino = Math.max(0, Math.min(r.length - 1, hasta))
  const [x] = r.splice(desde, 1)
  r.splice(destino, 0, x)
  return r
}

export interface Vecinos {
  antesDe?: string
  despuesDe?: string
}

export function vecinos(lista: readonly { id: string }[], id: string): Vecinos {
  const i = lista.findIndex((x) => x.id === id)
  if (i < 0) return {}
  const v: Vecinos = {}
  if (i > 0) v.despuesDe = lista[i - 1].id
  if (i < lista.length - 1) v.antesDe = lista[i + 1].id
  return v
}

/**
 * A qué posición va un elemento que se arrastra, dada la x del puntero y los
 * centros (en x) de los elementos tal como están pintados ahora (incluido el
 * que se arrastra, en su hueco original `desde`).
 */
export function indiceDestino(centros: readonly number[], x: number, desde: number): number {
  let destino = 0
  for (let i = 0; i < centros.length; i++) {
    if (i === desde) continue
    if (x > centros[i]) destino++
  }
  return destino
}

/** Movimiento completo listo para /v1/estantes/{id}/ordenar, o null si no cambió nada. */
export function movimientoDeOrden<T extends { id: string }>(
  lista: readonly T[],
  desde: number,
  hasta: number,
): { lista: T[]; cuerpo: { ejemplarId: string } & Vecinos } | null {
  if (desde === hasta || desde < 0 || desde >= lista.length) return null
  const nueva = mover(lista, desde, hasta)
  const id = lista[desde].id
  return { lista: nueva, cuerpo: { ejemplarId: id, ...vecinos(nueva, id) } }
}
