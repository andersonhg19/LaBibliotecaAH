import React, { useEffect, useRef } from 'react'

import { Animated, StyleSheet, Text } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { hora } from '@logica/formato'
import { fontSize, fuentes } from '@tema'
import { reducirMovimiento } from '@tema/web'
import type { Guardado } from '@utils/motorAudio'

/*
 * EL SELLO DEL PROGRESO (Ola E, F10): «Guardado en casa · 10:42» cuando el
 * servidor confirmó, o «Sin red: se guardará al volver» si no llegó (el motor
 * lo vuelve a intentar al volver la red). Dice lo que pasó de verdad, no lo que
 * se quería; con un pequeño «golpe de sello» al cambiar (sin él con «Reducir
 * movimiento»).
 */

export const TEXTOS_SELLO = {
  ok: (h: string) => `Guardado en casa${h ? ` · ${h}` : ''}`,
  pendiente: 'Sin red: se guardará al volver',
}

export function textoSello(g: Guardado): string | null {
  if (!g) return null
  return g.estado === 'ok' ? TEXTOS_SELLO.ok(hora(new Date(g.en).toISOString())) : TEXTOS_SELLO.pendiente
}

const SelloGuardado: React.FC<{ guardado: Guardado }> = ({ guardado }) => {
  const { colors } = useTheme()
  const texto = textoSello(guardado)
  const escala = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!texto || reducirMovimiento()) return
    escala.setValue(1.15)
    const a = Animated.timing(escala, { toValue: 1, duration: 300, useNativeDriver: false })
    a.start()
    return () => a.stop()
  }, [texto, escala])
  if (!texto) return null
  const ok = guardado?.estado === 'ok'
  return (
    <Animated.View
      style={[
        styles.sello,
        { borderColor: ok ? 'rgba(201,162,39,0.55)' : colors.danger, transform: [{ scale: escala }] },
      ]}
      accessibilityLiveRegion="polite"
      testID="sello-guardado"
    >
      <Text style={[styles.texto, { color: ok ? colors.textSecondary : colors.danger }]}>
        {ok ? '✓ ' : '⚠ '}
        {texto}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sello: { alignSelf: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 2, paddingHorizontal: 10 },
  texto: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
})

export default SelloGuardado
