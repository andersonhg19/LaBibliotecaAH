/*
 * TOKENS DEL LECTOR «TIPO PAPEL» Y DEL REPRODUCTOR. Viven aquí y no en el tema
 * global (theme/) a propósito: son del lector y de la voz. Están anotados para
 * el integrador por si quiere subirlos al tema. Colores de la paleta del plan
 * §10.1 (burdeos #6B1F2A, miel #D9A35B, latón #C9A227, nogal #4A2E1C).
 */

/** Alto de la barra de arriba del lector (botones de 44 + 6 arriba y abajo). */
export const ALTO_BARRA_LECTOR = 56

/** Alto del mini reproductor sin la zona segura (hilo de 3 + fila de 48 + 6 arriba y abajo + borde). */
export const ALTO_MINI = 64

export const LECTOR_PAPEL = {
  /**
   * Margen de arriba y de abajo del libro: la barra (arriba) y el folio (abajo)
   * caben en él, así la barra nunca tapa la primera línea (QA LV-10, UX-02).
   */
  margenMovil: ALTO_BARRA_LECTOR,
  margenPC: 64,
  /** Desde este ancho (y en horizontal), el libro abierto a dos columnas con lomo. */
  anchoDosColumnas: 1100,
  /** La búsqueda en miel con filete de latón (UX-13). */
  busquedaRelleno: 'rgba(217,163,91,0.42)',
  busquedaBorde: '#C9A227',
  /** La cinta del marcador. */
  cinta: '#6B1F2A',
  cintaLuz: '#8A2E3B',
  /** Cuánto tarda la barra en irse sola si no la usas. */
  barraSeVaMs: 4000,
  /** Cuánto se queda «↶ Mi posición anterior» (QA LV-12). */
  volverSeVaMs: 8000,
}

/** Reproductor: madera, cuero y latón. */
export const SALA_ESCUCHA = {
  laton: '#C9A227',
  latonOscuro: '#8C6D12',
  miel: '#D9A35B',
  nogal: '#4A2E1C',
  robleOscuro: '#2B1A10',
  pergamino: '#F3E9D2',
}
