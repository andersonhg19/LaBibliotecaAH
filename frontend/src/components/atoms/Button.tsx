import React from 'react'

import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fontWeight, fuentes, spacing } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { cuero } from '@tema/madera'
import { esWeb, web } from '@tema/web'

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

  /*
   * Materiales: el principal es LATÓN-MIEL pulido (degradado con bisel y un
   * BRILLO que recorre la placa al pasar el ratón); el secundario, CUERO con
   * filete de latón; el de peligro, burdeos lacado. Al pulsar, el botón se
   * hunde (escala 0,97) y en Android vibra un instante. Solo transform,
   * opacity y background-position: 60 fps en el iPhone.
   */
  const brillo = 'linear-gradient(110deg, rgba(255,255,255,0) 35%, rgba(255,250,230,0.45) 48%, rgba(255,255,255,0) 60%)'
  const material = (base: string) =>
    variant === 'primary' && !disabled
      ? {
          backgroundImage: `${brillo}, ${base}`,
          backgroundSize: '260% 100%, 100% 100%',
          boxShadow: isDark
            ? 'inset 0 1px 0 rgba(255,245,215,0.7), inset 0 -2px 0 rgba(90,55,20,0.35), 0 6px 16px rgba(20,10,4,0.45)'
            : 'inset 0 1px 0 rgba(255,220,190,0.45), 0 4px 12px rgba(74,46,28,0.35)',
        }
      : variant === 'secondary' && !disabled
        ? {
            backgroundImage: `${brillo}, ${cuero(colors.surfaceLight)}`,
            backgroundSize: '260% 100%, auto',
            boxShadow: `inset 0 0 0 1px ${colors.primaryLight}, inset 0 1px 0 rgba(255,235,200,0.12), 0 3px 8px rgba(20,10,4,0.3)`,
          }
        : variant === 'danger' && !disabled
          ? {
              backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(0,0,0,0.12))',
              boxShadow: '0 4px 12px rgba(20,10,4,0.3)',
            }
          : {}
  const basePrimaria = isDark
    ? 'linear-gradient(180deg, #F3D08F 0%, #D9A35B 42%, #C9A227 78%, #A9822A 100%)'
    : 'linear-gradient(180deg, #A9603A 0%, #8E4A22 50%, #6F3717 100%)'
  const placa = web(material(basePrimaria))
  const tocar = () => {
    try {
      if (esWeb && typeof navigator !== 'undefined') navigator.vibrate?.(8)
    } catch {
      /* sin vibración (iPhone) */
    }
    onPress()
  }

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
      style={(estado) => {
        /* react-native-web añade hovered y focused al estado del Pressable. */
        const { pressed, hovered } = estado as { pressed: boolean; hovered?: boolean }
        return [
          styles.base,
          contenedor,
          placa,
          hovered && !disabled && web({ backgroundPosition: '0% 0, 0 0', transform: 'translateY(-1px)' }),
          pressed && { opacity: 0.92, transform: [{ scale: 0.97 }] },
          web({
            cursor: disabled ? 'default' : 'pointer',
            backgroundPosition: hovered ? '0% 0, 0 0' : '100% 0, 0 0',
            transition:
              'transform 140ms ease, opacity 140ms ease, background-position 700ms ease, box-shadow 200ms ease',
          }),
          style,
        ]
      }}
      onPress={tocar}
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
