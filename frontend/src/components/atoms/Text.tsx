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
        }
      case 'title':
        return {
          fontSize: fontSize.xxl,
          fontFamily: fuentes.titulo,
          fontWeight: fontWeight.semiBold,
          letterSpacing: 0.2,
        }
      case 'subtitle':
        return { fontSize: fontSize.xl, fontFamily: fuentes.titulo, fontWeight: fontWeight.semiBold }
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

  return (
    <RNText
      style={[variantStyle(), { color: color || defaultColor(), textAlign: align }, style]}
      numberOfLines={numberOfLines}
      testID={testID}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? (variant === 'display' || variant === 'title' ? 'header' : undefined)}
      selectable={selectable}
    >
      {children}
    </RNText>
  )
}

export default AppText
