import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

interface Props {
  etiqueta: string
  activo?: boolean
  onPress: () => void
  /** Muestra una ✕ para quitarlo (chips de filtros activos). */
  quitable?: boolean
  icono?: string
  /** Rol del chip: casilla (por defecto) o una opción de un grupo (radio). */
  rol?: 'checkbox' | 'radio'
  disabled?: boolean
  accessibilityLabel?: string
  testID?: string
}

/*
 * Una ficha de filtro. Activa no es solo "otro color": lleva una marca ✓ y
 * su estado ARIA (estándar 35, UX-04: aria-checked, no solo accessibilityState).
 */
const Chip: React.FC<Props> = ({
  etiqueta,
  activo = false,
  onPress,
  quitable,
  icono,
  accessibilityLabel,
  testID,
  rol = 'checkbox',
  disabled,
}) => {
  const { colors } = useTheme()
  const fondo = activo ? colors.primary : colors.card
  const tinta = activo ? textoLegibleSobre(colors.primary) : colors.text
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      {...(quitable ? { accessibilityRole: 'button' as const } : estadoElegible(rol, activo, disabled))}
      accessibilityLabel={accessibilityLabel ?? (quitable ? `Quitar filtro ${etiqueta}` : etiqueta)}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: fondo,
          borderColor: activo ? colors.primary : colors.border,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
        web({ cursor: 'pointer' }),
      ]}
    >
      {activo && !quitable ? <Icono nombre="check" color={tinta} tamano={16} /> : null}
      {icono ? <Icono nombre={icono} color={tinta} tamano={16} /> : null}
      <Text style={[styles.texto, { color: tinta }]} numberOfLines={1}>
        {etiqueta}
      </Text>
      {quitable ? (
        <View accessible={false}>
          <Icono nombre="close" color={tinta} tamano={14} />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  texto: { fontSize: fontSize.xs, fontFamily: fuentes.uiMedia, maxWidth: 220 },
})

export default Chip
