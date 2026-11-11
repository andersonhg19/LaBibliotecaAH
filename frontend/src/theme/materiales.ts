/*
 * EL SISTEMA DE MATERIALES (plan de diseño H).
 *
 * Una pantalla nueva no elige "un gris con borde": elige de qué está hecha.
 * Hay cinco materiales —madera, cuero, latón, papel y tela— y tres niveles de
 * profundidad con sombra CÁLIDA (marrón, nunca negra pura: la luz de la casa es
 * de lámpara). Las tarjetas, las hojas, las barras y la administración salen de
 * aquí, así que todo nace dentro de la casa.
 *
 * Solo en la web llevan textura (en nativo y en las pruebas queda el color
 * plano que cada componente pone debajo).
 */
import { ThemeColors } from '@tema/colors'
import { cuero, fibraPapel, granoCuero, laton, montante, vetaHorizontal } from '@tema/madera'

/** Tres profundidades: apoyado, levantado, flotando. */
export const SOMBRA = {
  1: '0 1px 1px rgba(30,15,6,0.35), 0 2px 6px rgba(30,15,6,0.22)',
  2: '0 2px 3px rgba(30,15,6,0.35), 0 10px 22px rgba(30,15,6,0.35)',
  3: '0 4px 8px rgba(30,15,6,0.35), 0 24px 54px rgba(30,15,6,0.5)',
} as const

export type Material = 'madera' | 'cuero' | 'laton' | 'papel' | 'tela'

/** El fondo (imagen CSS) de cada material sobre su color base. */
export function texturaDe(material: Material, oscuro: boolean, base: string): string {
  switch (material) {
    case 'madera':
      return montante(oscuro)
    case 'cuero':
      return cuero(base)
    case 'laton':
      return laton
    case 'tela':
      return `${granoCuero}, repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 2px, rgba(0,0,0,0.04) 2px 4px), linear-gradient(${base}, ${base})`
    case 'papel':
    default:
      return `${fibraPapel}, linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.03)), linear-gradient(${base}, ${base})`
  }
}

/**
 * La tarjeta de la casa: de noche, cuero nogal con un filete claro arriba
 * (luz de la lámpara); de día, papel marfil con fibra. Mismo radio y sombra.
 */
export const panel = (oscuro: boolean, colors: ThemeColors) => ({
  backgroundImage: oscuro ? texturaDe('cuero', true, colors.card) : texturaDe('papel', false, colors.card),
  boxShadow: oscuro
    ? `inset 0 1px 0 rgba(255,228,180,0.08), ${SOMBRA[1]}`
    : `inset 0 1px 0 rgba(255,255,255,0.9), ${SOMBRA[1]}`,
})

/** La hoja que sube (modales): papel de la casa con filete de latón. */
export const hoja = (oscuro: boolean, colors: ThemeColors) => ({
  backgroundImage: texturaDe('papel', oscuro, colors.surface),
  boxShadow: SOMBRA[3],
})

/** La barra de arriba de cada sala: un listón de madera con su canto. */
export const liston = (oscuro: boolean) => ({
  backgroundImage: `${vetaHorizontal}, linear-gradient(180deg, ${oscuro ? 'rgba(58,36,22,0.96)' : 'rgba(243,233,210,0.94)'}, ${oscuro ? 'rgba(34,20,12,0.96)' : 'rgba(234,220,188,0.94)'})`,
  boxShadow: oscuro
    ? 'inset 0 -1px 0 rgba(201,162,39,0.35), 0 6px 14px rgba(0,0,0,0.35)'
    : 'inset 0 -1px 0 rgba(139,90,43,0.35), 0 6px 14px rgba(74,46,28,0.15)',
})

/**
 * Lo seleccionado (pestaña, segmento, chip activo) es una PLACA DE LATÓN,
 * no solo un subrayado (UX-01): se ve de un vistazo y de lejos.
 */
export const placaActiva = (oscuro: boolean) => ({
  backgroundImage: oscuro
    ? 'linear-gradient(180deg, rgba(201,162,39,0.30), rgba(201,162,39,0.14))'
    : 'linear-gradient(180deg, rgba(201,162,39,0.32), rgba(201,162,39,0.18))',
  boxShadow: 'inset 0 1px 0 rgba(255,240,200,0.35), 0 1px 3px rgba(30,15,6,0.3)',
})

/** Tinta grabada sobre latón: casi negro cálido (7,6:1 sobre #C9A227). */
export const TINTA_LATON = '#2B1A10'
/** Fondo plano del latón, para medir y para nativo. */
export const LATON_PLANO = '#D9B95A'
