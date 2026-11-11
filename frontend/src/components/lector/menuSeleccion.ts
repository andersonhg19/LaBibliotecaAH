/*
 * DÓNDE VA EL MENÚ DE LA SELECCIÓN. Nunca encima del texto elegido: arriba si
 * cabe (entre la barra y la selección), si no debajo; y si no cabe en ninguno
 * de los dos lados (selecciones largas), pegado al borde de la pantalla que
 * más sitio deja, sin pisar la primera ni la última línea elegida. Siempre
 * dentro de la pantalla, con una flechita que apunta al texto.
 */

export interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}

export interface PosicionMenu {
  left: number
  top: number
  /** true = el menú queda debajo de la selección (la flecha apunta hacia arriba). */
  debajo: boolean
  /** Dónde va la flecha, en px desde el borde izquierdo del menú. */
  flechaX: number
}

/** Hueco entre el menú y el texto (incluye la flecha). */
export const SEPARACION_MENU = 12
const BORDE = 8
const FLECHA_MARGEN = 18

export function posicionMenu(
  sel: Rect,
  menu: { ancho: number; alto: number },
  pantalla: { ancho: number; alto: number; arriba?: number; abajo?: number },
): PosicionMenu {
  const minTop = (pantalla.arriba ?? 0) + BORDE
  const maxBottom = pantalla.alto - (pantalla.abajo ?? 0) - BORDE
  const centro = sel.x + sel.ancho / 2
  const left = Math.round(Math.max(BORDE, Math.min(pantalla.ancho - menu.ancho - BORDE, centro - menu.ancho / 2)))
  const flechaX = Math.round(Math.max(FLECHA_MARGEN, Math.min(menu.ancho - FLECHA_MARGEN, centro - left)))
  const arriba = sel.y - SEPARACION_MENU - menu.alto
  const abajo = sel.y + sel.alto + SEPARACION_MENU
  if (arriba >= minTop) return { left, top: Math.round(arriba), debajo: false, flechaX }
  if (abajo + menu.alto <= maxBottom) return { left, top: Math.round(abajo), debajo: true, flechaX }
  // Selección más alta que la pantalla: donde más sitio quede, dentro de los límites.
  const sitioArriba = sel.y - minTop
  const sitioAbajo = maxBottom - (sel.y + sel.alto)
  return sitioAbajo >= sitioArriba
    ? { left, top: Math.round(Math.max(minTop, maxBottom - menu.alto)), debajo: true, flechaX }
    : { left, top: Math.round(minTop), debajo: false, flechaX }
}
