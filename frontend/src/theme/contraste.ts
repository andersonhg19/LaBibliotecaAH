/**
 * Contraste, medido con la formula de la WCAG.
 *
 * Existe porque el color del texto de un boton NO puede ser una constante. El
 * boton principal pintaba siempre el texto en blanco, y en el tema oscuro su
 * fondo es un ambar claro: 2.08:1, o sea, ilegible. El mismo componente, con
 * el mismo codigo, se leia bien en un tema y mal en el otro.
 *
 * La regla es una sola: sobre un fondo se pone el texto que mas contraste
 * tenga, y eso se calcula en vez de decidirse a ojo.
 */

/** Luminancia relativa de un color #RRGGBB. */
export const luminancia = (hex: string): number => {
  const h = hex.replace('#', '')
  const canal = (i: number) => {
    const v = parseInt(h.substring(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
}

/** Cuanto contrastan dos colores: 1 es invisible, 21 es negro sobre blanco. */
export const contraste = (a: string, b: string): number => {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * El blanco o el casi-negro, el que se lea mejor sobre ese fondo.
 *
 * Se usa #1A1A1A y no #000000 a proposito: el negro puro sobre un color
 * saturado vibra, y la diferencia de contraste entre los dos es despreciable.
 */
export const TEXTO_CLARO = '#FFFFFF'
export const TEXTO_OSCURO = '#1A1A1A'

export const textoLegibleSobre = (fondo: string): string =>
  contraste(TEXTO_CLARO, fondo) >= contraste(TEXTO_OSCURO, fondo) ? TEXTO_CLARO : TEXTO_OSCURO
