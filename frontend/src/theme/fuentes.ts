/*
 * TIPOGRAFÍA DE LA BIBLIOTECA.
 *
 * Tres voces, como en una biblioteca de verdad:
 *   · Cormorant Garamond para los títulos (rótulos de estante, portadas, lomos).
 *   · Inter para la interfaz (botones, etiquetas, cifras).
 *   · Literata para leer (y EB Garamond / Lora como alternativas en el lector).
 *
 * Los nombres son los que registra expo-font con @expo-google-fonts. Si la
 * fuente aún no cargó, el navegador cae en la serif / sans del sistema: por eso
 * cada familia lleva su respaldo en `familiaWeb`.
 */
export const fuentes = {
  titulo: 'CormorantGaramond_600SemiBold',
  tituloNegrita: 'CormorantGaramond_700Bold',
  tituloCursiva: 'CormorantGaramond_500Medium_Italic',
  ui: 'Inter_400Regular',
  uiMedia: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  uiNegrita: 'Inter_700Bold',
  lectura: 'Literata_400Regular',
} as const

/** Las familias que ofrece el lector, con el nombre que ve el usuario. */
export const FUENTES_LECTOR = [
  {
    clave: 'literata',
    nombre: 'Literata',
    css: "'Literata', Georgia, serif",
    archivo: 'Literata-Regular.ttf',
    cursiva: 'Literata-Italic.ttf',
  },
  {
    clave: 'garamond',
    nombre: 'EB Garamond',
    css: "'EB Garamond', Garamond, serif",
    archivo: 'EBGaramond-Regular.ttf',
    cursiva: 'EBGaramond-Italic.ttf',
  },
  {
    clave: 'lora',
    nombre: 'Lora',
    css: "'Lora', Georgia, serif",
    archivo: 'Lora-Regular.ttf',
    cursiva: 'Lora-Italic.ttf',
  },
] as const

export type ClaveFuenteLector = (typeof FUENTES_LECTOR)[number]['clave']
