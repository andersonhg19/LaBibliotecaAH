import type { AccessibilityRole, AccessibilityState } from 'react-native'

/*
 * EL ESTADO DE LO QUE SE ELIGE, DICHO COMO LO ENTIENDE CADA LECTOR (UX-04).
 *
 * react-native-web 0.21 ya no traduce `accessibilityState` a atributos ARIA: las
 * pestañas, los radios y los chips salían en el DOM sin `aria-selected` ni
 * `aria-checked`, y VoiceOver no decía "seleccionado". Las props `aria-*` sí
 * las pinta (y en nativo React Native las entiende igual), así que cada control
 * que se elige declara las dos cosas con esta función, y una prueba transversal
 * (AccesibilidadTransversal) exige que se use.
 *
 *   tab      → aria-selected   (pestañas)
 *   radio    → aria-checked    (uno de varios)
 *   checkbox → aria-checked    (chips de filtro)
 *   switch   → aria-checked    (permisos, roles)
 *   button   → aria-pressed    (botón que se queda pulsado: favorito, ordenar)
 */
type RolElegible = 'tab' | 'radio' | 'checkbox' | 'switch' | 'button'

export interface PropsEstado {
  accessibilityRole: AccessibilityRole
  role: 'tab' | 'radio' | 'checkbox' | 'switch' | 'button'
  accessibilityState: AccessibilityState
  'aria-selected'?: boolean
  'aria-checked'?: boolean
  'aria-disabled'?: boolean
}

export function estadoElegible(rol: RolElegible, activo: boolean, desactivado?: boolean): PropsEstado {
  const base = { accessibilityRole: rol, role: rol } as const
  const disabled = desactivado ? { 'aria-disabled': true } : {}
  if (rol === 'tab') {
    return {
      ...base,
      accessibilityState: { selected: activo, disabled: !!desactivado },
      'aria-selected': activo,
      ...disabled,
    }
  }
  if (rol === 'button') {
    /* aria-pressed no está en los tipos de React Native, pero react-native-web
       lo pasa al DOM tal cual; en nativo se ignora y queda accessibilityState. */
    return {
      ...base,
      accessibilityState: { selected: activo, disabled: !!desactivado },
      ...({ 'aria-pressed': activo } as object),
      ...disabled,
    } as PropsEstado
  }
  return {
    ...base,
    accessibilityState: { checked: activo, disabled: !!desactivado },
    'aria-checked': activo,
    ...disabled,
  }
}
