/*
 * EL FOLIO DEL LECTOR (diseño «lector tipo papel»): al pie de la página, como
 * en un libro impreso, «p. 34 de 210 · quedan 12 min». Funciones puras.
 *
 * Las «páginas» no son las de la pantalla (cambian con la letra y el tamaño):
 * son páginas de libro impreso, ~1.800 caracteres de texto, estables aunque
 * cambies la letra. foliate cuenta «posiciones» de 1.500 bytes del archivo
 * (con etiquetas, y según el EPUB, comprimidos); `ratio` es cuántos caracteres
 * de texto hay por byte, medido en la primera sección que se abre.
 */

const BYTES_POR_POSICION = 1500
const CARACTERES_POR_PAGINA = 1800

export interface Paginacion {
  pagina: number
  paginas: number
}

/** Página impresa estimada a partir de las posiciones de foliate. */
export function paginaImpresa(posicion: number, totalPosiciones: number, ratio: number): Paginacion | null {
  if (!Number.isFinite(posicion) || !Number.isFinite(totalPosiciones) || totalPosiciones <= 0) return null
  const r = Math.min(4, Math.max(0.15, Number.isFinite(ratio) && ratio > 0 ? ratio : 0.6))
  const k = (r * BYTES_POR_POSICION) / CARACTERES_POR_PAGINA
  const paginas = Math.max(1, Math.ceil(totalPosiciones * k))
  const pagina = Math.min(paginas, Math.max(1, Math.floor(posicion * k) + 1))
  return { pagina, paginas }
}

/** Minutos que quedan del capítulo (a 1x), o null si no se sabe. */
export function minutosRestantes(minutosCapitulo: number | null | undefined, fraccionSeccion: number): number | null {
  if (!minutosCapitulo || minutosCapitulo <= 0 || !Number.isFinite(fraccionSeccion)) return null
  const f = Math.min(1, Math.max(0, fraccionSeccion))
  return Math.max(0, Math.round(minutosCapitulo * (1 - f)))
}

export function textoQuedan(min: number | null): string | null {
  if (min == null) return null
  if (min < 1) return 'último minuto del capítulo'
  if (min < 60) return `quedan ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `quedan ${h} h${m ? ` ${m} min` : ''}`
}

/**
 * Lo que va al pie de cada columna. Con una columna: todo junto. Con dos (el
 * libro abierto del PC): la página de la izquierda y la de la derecha, que
 * lleva además lo que queda.
 */
export function textoFolio(p: Paginacion | null, minutos: number | null, columnas: number): string[] {
  const quedan = textoQuedan(minutos)
  if (columnas >= 2) {
    const izq = p ? `${p.pagina}` : ''
    const der = [p ? `${Math.min(p.paginas, p.pagina + 1)} de ${p.paginas}` : '', quedan].filter(Boolean).join(' · ')
    return [izq, der]
  }
  return [[p ? `p. ${p.pagina} de ${p.paginas}` : '', quedan].filter(Boolean).join(' · ')]
}
