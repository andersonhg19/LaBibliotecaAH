/*
 * QUÉ HACE UN TOQUE EN EL LIBRO Y QUIÉN MOVIÓ LA PÁGINA. Funciones puras que
 * usa LectorFoliate.web (y que se prueban sin navegador).
 */

export type AccionToque = 'nada' | 'anterior' | 'siguiente' | 'centro'

/**
 * Un toque en el texto. El 25 % de cada lado pasa página y el centro muestra u
 * oculta la barra; pero un toque sobre una nota o un resaltado solo abre la
 * nota (QA LV-05: antes además pasaba página y al cerrar ya no estabas allí),
 * y un enlace o una selección mandan sobre todo lo demás.
 */
export function accionDelToque(t: {
  x: number
  ancho: number
  sobreAnotacion: boolean
  sobreEnlace: boolean
  haySeleccion: boolean
}): AccionToque {
  if (t.sobreAnotacion || t.sobreEnlace || t.haySeleccion || !(t.ancho > 0)) return 'nada'
  if (t.x < t.ancho * 0.25) return 'anterior'
  if (t.x > t.ancho * 0.75) return 'siguiente'
  return 'centro'
}

const MOTIVOS_DEL_USUARIO = ['page', 'snap', 'scroll', 'selection']

/**
 * Si un `relocate` de foliate lo provocó la persona. foliate no lo dice
 * siempre: en desplazamiento continuo «Página siguiente» llega con motivo
 * `null` (QA LV-08), así que los gestos propios (botones, teclado, índice,
 * buscar, ir a %) abren una ventana `gestoHasta`. Lo que mueve el libro solo
 * (seguir a la voz, abrir) abre `ignorarHasta`.
 */
export function esMovimientoDelUsuario(
  motivo: string | null | undefined,
  ahora: number,
  ignorarHasta: number,
  gestoHasta: number,
): boolean {
  if (ahora < gestoHasta) return true
  return MOTIVOS_DEL_USUARIO.includes(motivo ?? '') && ahora > ignorarHasta
}

/** Dónde estaba y dónde está el libro: lo justo para saber si de verdad se movió. */
export interface Lugar {
  cfi: string | null
  fraccion: number
}

/**
 * Si un `relocate` de la persona debe esconder la barra (QA RW-02). foliate
 * llama a `snap()` en CADA `touchend` del teléfono, también en un toque quieto,
 * y emite `relocate` con motivo `'snap'` aunque la página no cambie: antes eso
 * contaba como pasar página y la barra recién mostrada se iba a los 0,4 s.
 * Ahora solo la esconde un movimiento que cambia de verdad el lugar.
 */
export function debeOcultarBarra(
  motivo: string | null | undefined,
  porUsuario: boolean,
  antes: Lugar | null,
  ahora: Lugar,
): boolean {
  if (!porUsuario) return false
  if (!['page', 'snap', 'scroll', '', null, undefined].includes(motivo as string | null | undefined)) return false
  if (!antes) return true
  if (antes.cfi && ahora.cfi) return antes.cfi !== ahora.cfi
  return Math.abs(antes.fraccion - ahora.fraccion) > 1e-4
}

/** Un rectángulo de la pantalla (o del documento del capítulo). */
export interface Caja {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * ¿El punto cae sobre alguna de las cajas de un resaltado? Con holgura: entre
 * renglón y renglón queda un hueco (el interlineado) y cerca del margen el
 * `hitTest` de foliate, con las cajas que midió al pintar, fallaba (QA LV-05:
 * tocar el segundo renglón de un resaltado en el borde izquierdo pasaba página).
 */
export function puntoSobreCajas(x: number, y: number, cajas: ArrayLike<Caja>, holgura = { x: 4, y: 6 }): boolean {
  for (let i = 0; i < cajas.length; i++) {
    const c = cajas[i]
    if (c.right - c.left <= 0 || c.bottom - c.top <= 0) continue
    if (x >= c.left - holgura.x && x <= c.right + holgura.x && y >= c.top - holgura.y && y <= c.bottom + holgura.y)
      return true
  }
  return false
}
