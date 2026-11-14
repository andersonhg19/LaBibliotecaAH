/*
 * QUÉ CLASE DE FALLO TIENE LA CINTA (0.4.0, auditoría RP-04). Vive aparte de
 * utils/cinta para que el motor lo use sin cargar mp4box.
 *
 *   · cancelada  → otra carga la sustituyó o se soltó la cinta: no es un fallo;
 *   · red        → sin red o la red se cortó: se reintenta, la cinta sigue;
 *   · acceso     → 401/403/404/410: se vuelve a pedir el capítulo (URL con token nuevo);
 *   · servidor   → 5xx: pasajero, se reintenta como la red;
 *   · plataforma → el navegador no puede con la cinta (MSE, mp4 ilegible…).
 */

/** Nombre del error de una carga cancelada. */
export const CANCELADA = 'CintaCancelada'
/** Nombre del error de un corte de red al bajar un capítulo. */
export const ERROR_RED = 'ErrorDeRed'

export type FalloCinta = 'cancelada' | 'red' | 'acceso' | 'servidor' | 'plataforma'

export function clasificarFallo(e: unknown): FalloCinta {
  const nombre = (e as { name?: string } | null)?.name
  const mensaje = String((e as { message?: string } | null)?.message ?? e)
  if (nombre === CANCELADA) return 'cancelada'
  if (nombre === ERROR_RED) return 'red'
  const http = /^audio (\d{3})/.exec(mensaje)
  if (http) return Number(http[1]) >= 500 ? 'servidor' : 'acceso'
  return 'plataforma'
}

export const errorCancelada = () => Object.assign(new Error('cinta: cancelada'), { name: CANCELADA })
export const errorDeRed = (e: unknown) =>
  Object.assign(new Error(`red: ${String((e as Error | null)?.message ?? e)}`), { name: ERROR_RED })
