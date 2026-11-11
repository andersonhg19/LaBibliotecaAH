import React from 'react'

import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fontWeight, fuentes, spacing } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { web } from '@tema/web'

/*
 * Botón de la biblioteca. El principal es una placa de latón pulido (en la
 * web, con un degradado y un brillo arriba); el resto, cuero o un filete fino.
 * El color del texto se CALCULA sobre el fondo (textoLegibleSobre): nunca un
 * blanco fijo que en un tema se lee y en el otro no.
 */
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
type ButtonSize = 'small' | 'medium' | 'large'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  size?: ButtonSize
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  icono?: string
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  size = 'medium',
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
  icono,
}) => {
  const { colors, isDark } = useTheme()

  const fondo = (): string => {
    if (disabled) return colors.surfaceLight
    switch (variant) {
      case 'primary':
        return colors.primary
      case 'secondary':
        return colors.surfaceLight
      case 'danger':
        return colors.danger
      default:
        return 'transparent'
    }
  }

  const colorTexto = (): string => {
    if (disabled) return colors.textMuted
    if (variant === 'outline' || variant === 'ghost') return colors.primary
    if (variant === 'secondary') return colors.text
    return textoLegibleSobre(fondo())
  }

  const pad = size === 'small' ? spacing.sm : size === 'large' ? spacing.md + 2 : spacing.sm + 4
  const tam = size === 'small' ? fontSize.xs : size === 'large' ? fontSize.md : fontSize.sm

  const placa =
    variant === 'primary' && !disabled
      ? web({
          backgroundImage: isDark
            ? 'linear-gradient(180deg, #F0C985 0%, #D9A35B 45%, #B88437 100%)'
            : 'linear-gradient(180deg, #A9603A 0%, #8E4A22 50%, #6F3717 100%)',
          boxShadow: isDark
            ? 'inset 0 1px 0 rgba(255,245,215,0.65), inset 0 -2px 0 rgba(90,55,20,0.35), 0 6px 16px rgba(0,0,0,0.45)'
            : 'inset 0 1px 0 rgba(255,220,190,0.45), 0 4px 12px rgba(74,46,28,0.35)',
        })
      : variant === 'danger' && !disabled
        ? web({ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' })
        : variant === 'secondary'
          ? web({ boxShadow: `inset 0 0 0 1px ${colors.border}` })
          : {}

  const contenedor: ViewStyle = {
    backgroundColor: fondo(),
    paddingVertical: pad,
    paddingHorizontal: pad * 1.6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    borderWidth: variant === 'outline' ? 1.5 : 0,
    borderColor: variant === 'outline' ? colors.primary : undefined,
  }

  const texto: TextStyle = {
    color: colorTexto(),
    fontSize: tam,
    fontFamily: fuentes.uiSemi,
    fontWeight: fontWeight.semiBold,
    letterSpacing: 0.3,
  }

  return (
    <Pressable
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        contenedor,
        placa,
        pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
        web({ cursor: disabled ? 'default' : 'pointer', transition: 'transform 120ms ease, opacity 120ms ease' }),
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={colorTexto()} size="small" />
      ) : (
        <>
          {icono ? (
            <View>
              <Icono nombre={icono} color={colorTexto()} tamano={tam + 4} />
            </View>
          ) : null}
          <Text style={texto}>{title}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({ base: { minHeight: 44 } })

export default Button
