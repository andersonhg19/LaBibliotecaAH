import React, { useEffect, useState } from 'react'

import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { etiquetaSinConexion, textoSinConexion } from '@logica/leyendo'
import { fontSize, fuentes } from '@tema'
import { type ProgresoSinConexion, escucharSinConexion, progresoSinConexion } from '@utils/sinConexion'

/** El estado de la copia sin conexión de un libro, al día (se suscribe a los cambios). */
export function useSinConexion(ejemplarId: string): ProgresoSinConexion | null {
  const [p, setP] = useState<ProgresoSinConexion | null>(null)
  useEffect(() => {
    let vivo = true
    setP(null)
    Promise.resolve()
      .then(() => progresoSinConexion(ejemplarId))
      .then((x) => {
        if (vivo && x) setP(x)
      })
      .catch(() => {})
    let baja: (() => void) | undefined
    try {
      baja = escucharSinConexion((x) => {
        if (vivo && x?.ejemplarId === ejemplarId) setP(x)
      })
    } catch {
      baja = undefined
    }
    return () => {
      vivo = false
      baja?.()
    }
  }, [ejemplarId])
  return p
}

/*
 * 0.5.0 (C12) · LA MARCA DISCRETA «Sin conexión ✓» / «Guardando 12/40» bajo un
 * libro en «Leyendo». Si no hay copia ni se está haciendo (o el navegador no
 * puede), no ocupa nada: no hay que explicar lo que no pasa.
 */
const MarcaSinConexion: React.FC<{ ejemplarId: string; color?: string; style?: StyleProp<TextStyle> }> = ({
  ejemplarId,
  color,
  style,
}) => {
  const { colors } = useTheme()
  const p = useSinConexion(ejemplarId)
  const texto = textoSinConexion(p)
  if (!texto) return null
  return (
    <Text
      style={[styles.marca, { color: color ?? colors.textSecondary }, style]}
      accessibilityLabel={etiquetaSinConexion(p) ?? texto}
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      testID={`sin-conexion-${ejemplarId}`}
    >
      {texto}
    </Text>
  )
}

const styles = StyleSheet.create({
  marca: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
})

export default MarcaSinConexion
