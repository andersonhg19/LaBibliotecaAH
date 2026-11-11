import React from 'react'

import { Pressable, StyleSheet, View } from 'react-native'

import { useNavigation } from '@react-navigation/native'

import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { volverOInicio } from '@navegacion/linking'
import { liston } from '@tema/materiales'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

export interface AccionEncabezado {
  icono: string
  etiqueta: string
  onPress: () => void
  activo?: boolean
  testID?: string
  /** Mientras guarda: no admite un segundo toque (BI-09). */
  disabled?: boolean
}

interface Props {
  titulo: string
  subtitulo?: string
  /** Con flecha atrás. */
  atras?: boolean
  acciones?: AccionEncabezado[]
  transparente?: boolean
}

/** El botón redondo de la barra de arriba (44×44 como mínimo). */
export const BotonIcono: React.FC<AccionEncabezado & { color?: string; tamano?: number }> = ({
  icono,
  etiqueta,
  onPress,
  activo,
  testID,
  color,
  tamano = 22,
  disabled,
}) => {
  const { colors } = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      {...(activo === undefined
        ? { accessibilityRole: 'button' as const, accessibilityState: disabled ? { disabled: true } : undefined }
        : estadoElegible('button', activo, disabled))}
      accessibilityLabel={etiqueta}
      style={(estado) => {
        /* Botón de icono: al pasar, un halo de latón; al pulsar, se hunde (escala). */
        const { pressed, hovered } = estado as { pressed: boolean; hovered?: boolean }
        return [
          styles.boton,
          disabled && { opacity: 0.5 },
          activo && { backgroundColor: colors.surfaceLight, borderColor: colors.primary, borderWidth: 1 },
          hovered && !disabled && web({ backgroundColor: 'rgba(201,162,39,0.14)' }),
          pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] },
          web({ cursor: 'pointer', transition: 'transform 120ms ease, background-color 160ms ease' }),
        ]
      }}
    >
      <Icono nombre={icono} color={color ?? (activo ? colors.primary : colors.text)} tamano={tamano} relleno={activo} />
    </Pressable>
  )
}

/*
 * La barra de arriba de cada sala: atrás (si hay de dónde volver), el rótulo
 * en Cormorant como una placa de latón, y las acciones a la derecha.
 */
const Encabezado: React.FC<Props> = ({ titulo, subtitulo, atras, acciones = [], transparente }) => {
  const { colors, isDark } = useTheme()
  const navigation = useNavigation()
  return (
    <View
      style={[
        styles.barra,
        !transparente && {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        web({ position: 'sticky', top: 0, zIndex: 10, backdropFilter: transparente ? undefined : 'blur(6px)' }),
        !transparente && web(liston(isDark)),
      ]}
    >
      {atras ? (
        <BotonIcono icono="back" etiqueta="Volver" onPress={() => volverOInicio(navigation)} />
      ) : (
        <View style={styles.hueco} />
      )}
      <View style={styles.centro}>
        <AppText variant="subtitle" numberOfLines={1} align="center" accessibilityRole="header">
          {titulo}
        </AppText>
        {subtitulo ? (
          <AppText variant="caption" numberOfLines={1} align="center" color={colors.textSecondary}>
            {subtitulo}
          </AppText>
        ) : null}
      </View>
      <View style={styles.derecha}>
        {acciones.map((a) => (
          <BotonIcono key={a.etiqueta} {...a} />
        ))}
        {acciones.length === 0 ? <View style={styles.hueco} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, minHeight: 56 },
  boton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hueco: { width: 44, height: 44 },
  centro: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  derecha: { flexDirection: 'row', alignItems: 'center' },
})

export default Encabezado
