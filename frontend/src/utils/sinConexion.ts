/**
 * Libros disponibles sin conexión (0.5.0, contrato C12).
 *
 * Regla de producto (Anderson, 2026-11-25): un libro en «Leyendo» tiene TODAS sus
 * pistas de voz preparadas en el servidor y descargadas en el dispositivo; al pasar
 * a Leído / Abandonado / Por leer (o al quitarlo de «Leyendo») se borra la copia del
 * DISPOSITIVO. El audio del servidor no se borra. Nunca se espera a la descarga para
 * empezar a escuchar: es en segundo plano.
 *
 * ESTE ARCHIVO ES EL CONTRATO entre la ola de voz (que lo implementa: service worker,
 * Cache Storage, cola de descargas) y la ola de UI (que solo lo consume). La firma de
 * lo exportado no cambia sin acordarlo.
 */

/** Estado de la copia local de un libro. */
export type EstadoSinConexion =
  /** No hay copia ni se está haciendo (libro fuera de «Leyendo» o sin audio). */
  | 'ninguno'
  /** El servidor aún está preparando capítulos y/o se están bajando. */
  | 'descargando'
  /** Todos los capítulos en voz del libro están en el dispositivo. */
  | 'completo'
  /** El navegador no deja guardar (sin service worker, sin espacio o modo privado). */
  | 'no-disponible'
  /** Algo falló; se reintenta solo en la siguiente sincronización. */
  | 'error'

export interface ProgresoSinConexion {
  ejemplarId: string
  estado: EstadoSinConexion
  /** Capítulos en voz del libro (los de `enVoz`). */
  total: number
  /** Capítulos ya guardados en el dispositivo. */
  guardados: number
  /** Bytes que ocupa la copia local (aprox.). */
  bytes: number
  /** Texto corto para la UI, en español («12 de 40 capítulos sin conexión»). */
  mensaje: string
}

/** ¿Este navegador puede guardar libros sin conexión? (service worker + Cache Storage). */
export function sinConexionDisponible(): boolean {
  return false
}

/**
 * Ajusta las copias locales a la lista de libros en «Leyendo»: prepara y baja los que
 * faltan (en segundo plano, de uno en uno) y BORRA las copias de los que ya no están.
 * Idempotente; se puede llamar al abrir la app, al volver la red y tras cambiar un estado.
 */
export async function sincronizarSinConexion(_leyendo: ReadonlyArray<{ id: string }>): Promise<void> {
  /* implementación: ola de voz */
}

/** Empieza (o retoma) la copia local de un libro. No espera a que termine. */
export async function guardarSinConexion(_ejemplarId: string): Promise<void> {
  /* implementación: ola de voz */
}

/** Borra la copia local de un libro (no toca el servidor). */
export async function olvidarSinConexion(_ejemplarId: string): Promise<void> {
  /* implementación: ola de voz */
}

/** Estado actual de un libro. */
export async function progresoSinConexion(ejemplarId: string): Promise<ProgresoSinConexion> {
  return { ejemplarId, estado: 'no-disponible', total: 0, guardados: 0, bytes: 0, mensaje: '' }
}

/** Todas las copias locales (para Ajustes). */
export async function listarSinConexion(): Promise<ProgresoSinConexion[]> {
  return []
}

/** Se suscribe a cambios de progreso de cualquier libro; devuelve la función para darse de baja. */
export function escucharSinConexion(_fn: (p: ProgresoSinConexion) => void): () => void {
  return () => {}
}
