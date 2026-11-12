import React from 'react'

import { Pressable, StyleSheet, Text } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'

/*
 * Una pastilla discreta de la sala de escucha (borde de latón, sin relleno):
 * «Capítulo 3 de 12 ▾» y «Ver texto». Abren algo puntual; lo de siempre (la
 * portada y el capítulo) sigue siendo lo que manda en la pantalla.
 */
const Pastilla: React.FC<{
  icono: string
  texto: string
  etiqueta: string
  onPress: () => void
  desplegable?: boolean
  abierta?: boolean
  testID?: string
}> = ({ icono, texto, etiqueta, onPress, desplegable, abierta, testID }) => {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={desplegable ? { expanded: !!abierta } : undefined}
      aria-expanded={desplegable ? !!abierta : undefined}
      testID={testID}
      style={({ pressed }) => [
        styles.pastilla,
        { borderColor: 'rgba(201,162,39,0.55)', opacity: pressed ? 0.75 : 1 },
        web({ cursor: 'pointer', transition: 'background-color 160ms ease' }),
      ]}
    >
      <Icono nombre={icono} color={SALA_ESCUCHA.laton} tamano={18} />
      <Text style={[styles.texto, { color: colors.textSecondary }]} numberOfLines={1}>
        {texto}
      </Text>
      {desplegable ? <Icono nombre="down" color={colors.textMuted} tamano={16} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 22,
    flexShrink: 1,
  },
  texto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, flexShrink: 1, fontVariant: ['lining-nums'] },
})

export default Pastilla
