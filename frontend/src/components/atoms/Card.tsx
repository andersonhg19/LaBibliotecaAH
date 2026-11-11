import React from 'react'

import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { spacing } from '@tema'
import { panel } from '@tema/materiales'
import { web } from '@tema/web'

interface CardProps {
  /** Lo que anuncia el lector de pantalla. */
  accessibilityLabel?: string
  /**
   * Agrupa el contenido en UN solo elemento para el lector.
   *
   * Hace falta tambien cuando la tarjeta NO es pulsable: una tarjeta de cifra
   * suelta "Gastos", "1.240.000" y "este mes" como tres cosas distintas, y con
   * cuatro seguidas no se sabe que numero era de cual.
   */
  accessible?: boolean
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}

const Card: React.FC<CardProps> = ({ children, style, onPress, accessibilityLabel, accessible }) => {
  const { colors, isDark } = useTheme()

  /* Cuero de nogal de noche, papel marfil de día (sistema de materiales). */
  const cardStyle: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
    ...web(panel(isDark, colors)),
  }

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.tocable, cardStyle, style]}
        onPress={onPress}
        activeOpacity={0.7}
        /* Una tarjeta pulsable es un boton aunque no lo parezca. Sin el rol, el
           lector la anuncia como texto suelto y no dice que se puede tocar. */
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    )
  }

  return (
    <View style={[cardStyle, style]} accessible={accessible} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({ tocable: { minHeight: 44 } })

export default Card
