import { Platform, TextStyle, ViewStyle } from 'react-native'

/*
 * Estilos que solo existen en la web (gradientes, ruido SVG, perspectiva 3D,
 * sombras múltiples, transiciones). react-native-web los pasa tal cual al CSS;
 * en nativo (y en las pruebas, que corren como nativo) se ignoran y queda el
 * color plano que cada componente pone debajo.
 */
export const esWeb = Platform.OS === 'web'

export const web = (estilo: Record<string, unknown>): ViewStyle & TextStyle =>
  (esWeb ? estilo : {}) as unknown as ViewStyle & TextStyle

/** Si el usuario pidió menos movimiento (Ajustes del sistema → Accesibilidad). */
export const reducirMovimiento = (): boolean => {
  try {
    return esWeb && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
