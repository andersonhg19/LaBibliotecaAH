/*
 * LA PALETA DE LA BIBLIOTECA (plan maestro §10.1).
 *
 * Dos temas con las mismas claves:
 *   · "Biblioteca de noche" (por defecto): roble muy oscuro, papel pergamino,
 *     miel y latón para lo que brilla.
 *   · "Sala de lectura de día": pergamino y marfil, tinta de roble, cedro.
 *
 * Los tonos crudos de la madera (`paleta`) se usan para texturas, lomos y
 * estantes. Los del tema (`darkColors` / `lightColors`) son los que llevan
 * texto, y por eso están MEDIDOS: ElContrasteSeMide los vuelve a medir en cada
 * construcción. Si un hex nuevo no llega a 4.5:1, la prueba se pone roja.
 *
 * Por qué algunos tonos del tema no son exactamente los de la paleta: el cedro
 * (#B5653A) sobre nogal se queda en 2.3:1 — precioso para un borde, ilegible
 * para una palabra. En el tema de noche se usa una variante más clara del mismo
 * tono para el texto, y el cedro original queda para superficies.
 */

/** Los diez tonos de la madera y el papel, tal como los fija el plan. */
export const paleta = {
  robleOscuro: '#2B1A10',
  nogal: '#4A2E1C',
  roble: '#8B5A2B',
  cedro: '#B5653A',
  miel: '#D9A35B',
  laton: '#C9A227',
  pergamino: '#F3E9D2',
  marfil: '#FBF7EE',
  cueroVerde: '#2F4A3A',
  burdeos: '#6B1F2A',
} as const

export const darkColors = {
  /** Fondo: el roble de noche, un punto más hondo que robleOscuro para que los estantes destaquen. */
  background: '#22140C',
  surface: '#3A2416',
  surfaceLight: '#4A2E1C',
  card: '#301D12',
  /** Miel: botones y lo activo. */
  primary: '#D9A35B',
  /** Latón: detalles metálicos, iconos activos. */
  primaryLight: '#C9A227',
  /** Cedro, aclarado para que se lea como texto sobre la madera. */
  secondary: '#E39A6F',
  /** Cuero verde de lámpara, aclarado para texto. */
  accent: '#9CC9A8',
  /** Burdeos, aclarado para texto (favoritos, peligro). */
  danger: '#F08A95',
  warning: '#E8C25A',
  success: '#9CC9A8',
  text: '#F3E9D2',
  textSecondary: '#E0CFAE',
  textMuted: '#C9B18A',
  border: '#6B4A30',
  /** El velo de los modales: oscuro y cálido, no negro. */
  velo: 'rgba(16,9,5,0.72)',
  /** Resaltado de la frase que suena (miel) y de la palabra (latón). */
  vozFrase: 'rgba(217,163,91,0.38)',
  vozPalabra: 'rgba(201,162,39,0.65)',
}

export const lightColors: typeof darkColors = {
  background: '#F3E9D2',
  surface: '#FBF7EE',
  surfaceLight: '#EADCBC',
  card: '#FFFDF8',
  /** Cedro hondo: aguanta texto blanco encima. */
  primary: '#8E4A22',
  primaryLight: '#8B5A2B',
  secondary: '#6B1F2A',
  accent: '#2F4A3A',
  danger: '#8E1F2E',
  warning: '#7A4E00',
  success: '#2F5A40',
  text: '#2B1A10',
  textSecondary: '#4A2E1C',
  textMuted: '#664A35',
  border: '#C9B48E',
  velo: 'rgba(43,26,16,0.55)',
  vozFrase: 'rgba(217,163,91,0.45)',
  vozPalabra: 'rgba(201,162,39,0.7)',
}

export type ThemeColors = typeof darkColors
