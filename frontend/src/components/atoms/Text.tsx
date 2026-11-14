import React from 'react'

import { Text as RNText, StyleProp, TextStyle } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fontWeight, fuentes } from '@tema'

/*
 * El texto de la biblioteca: los títulos en Cormorant Garamond (como los
 * rótulos dorados de un estante), el resto en Inter. `display` es el rótulo
 * grande de una pantalla; `titulo`/`subtitle` las cabeceras de sección.
 */
type TextVariant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label'

interface TextProps {
  variant?: TextVariant
  color?: string
  align?: TextStyle['textAlign']
  children: React.ReactNode
  style?: StyleProp<TextStyle>
  numberOfLines?: number
  testID?: string
  adjustsFontSizeToFit?: boolean
  accessibilityLabel?: string
  accessibilityRole?: 'header' | 'text' | 'none'
  selectable?: boolean
  /**
   * Nivel del encabezado (UX5-09): 1 el rótulo de la sala, 2 el libro y las
   * placas, 3 las secciones. Sin él, `display` es 1 y `title`, 2 (antes todo
   * salía como <h1> y el rotor de VoiceOver no distinguía niveles).
   */
  nivel?: 1 | 2 | 3 | 4
}

const AppText: React.FC<TextProps> = ({
  variant = 'body',
  color,
  align,
  children,
  style,
  numberOfLines,
  testID,
  adjustsFontSizeToFit,
  accessibilityLabel,
  accessibilityRole,
  selectable,
  nivel,
}) => {
  const { colors } = useTheme()

  const variantStyle = (): TextStyle => {
    switch (variant) {
      case 'display':
        return {
          fontSize: fontSize.title,
          fontFamily: fuentes.tituloNegrita,
          fontWeight: fontWeight.bold,
          letterSpacing: 0.3,
          // UX5-11: Cormorant trae cifras antiguas («Capítulo ı»): en títulos, cifras modernas.
          fontVariant: ['lining-nums'],
        }
      case 'title':
        return {
          fontSize: fontSize.xxl,
          fontFamily: fuentes.titulo,
          fontWeight: fontWeight.semiBold,
          letterSpacing: 0.2,
          fontVariant: ['lining-nums'],
        }
      case 'subtitle':
        return {
          fontSize: fontSize.xl,
          fontFamily: fuentes.titulo,
          fontWeight: fontWeight.semiBold,
          fontVariant: ['lining-nums'],
        }
      case 'caption':
        return { fontSize: fontSize.xs, fontFamily: fuentes.ui, fontWeight: fontWeight.regular }
      case 'label':
        return { fontSize: fontSize.sm, fontFamily: fuentes.uiMedia, fontWeight: fontWeight.medium }
      case 'body':
      default:
        return { fontSize: fontSize.sm, fontFamily: fuentes.ui, fontWeight: fontWeight.regular, lineHeight: 23 }
    }
  }

  const defaultColor = (): string => {
    switch (variant) {
      case 'caption':
        return colors.textMuted
      case 'label':
        return colors.textSecondary
      default:
        return colors.text
    }
  }

  const rol = accessibilityRole ?? (variant === 'display' || variant === 'title' ? 'header' : undefined)
  const nivelEfectivo = rol === 'header' ? (nivel ?? (variant === 'display' ? 1 : 2)) : undefined
  /* En la web, role="heading" + aria-level sale como <h1>…<h4>; en nativo, accessibilityRole header. */
  const encabezado = nivelEfectivo ? ({ role: 'heading', 'aria-level': nivelEfectivo } as object) : {}
  return (
    <RNText
      style={[variantStyle(), { color: color || defaultColor(), textAlign: align }, style]}
      numberOfLines={numberOfLines}
      testID={testID}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={rol}
      selectable={selectable}
      {...encabezado}
    >
      {children}
    </RNText>
  )
}

export default AppText
