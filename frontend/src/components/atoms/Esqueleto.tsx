import React from 'react'

import { DimensionValue, StyleSheet, View, ViewStyle } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { web } from '@tema/web'

/*
 * ESQUELETOS DE CARGA (F3, propuesta #4 de la auditoría UX). Mientras llegan
 * los datos se pinta la silueta de lo que viene —lomos en la balda, portadas
 * 2:3, la tapa y el título de la ficha— con un brillo de madera que la recorre
 * (`bah-brillo`, CSS global). Así no hay salto de «nada» a «todo». Con «Reducir
 * movimiento», el CSS global apaga el brillo y queda solo la silueta.
 *
 * No se anuncian uno a uno: el contenedor dice «Cargando…» una vez.
 */

interface PlacaProps {
  ancho: DimensionValue
  alto: number
  radio?: number
  style?: ViewStyle
}

/** Un trozo de silueta. */
export const Placa: React.FC<PlacaProps> = ({ ancho, alto, radio = 6, style }) => {
  const { colors, isDark } = useTheme()
  const base = isDark ? 'rgba(243,233,210,0.07)' : 'rgba(74,46,28,0.08)'
  const brillo = isDark ? 'rgba(243,233,210,0.14)' : 'rgba(255,250,240,0.55)'
  return (
    <View
      style={[
        { width: ancho, height: alto, borderRadius: radio, backgroundColor: colors.border, opacity: 0.55 },
        web({
          backgroundColor: base,
          opacity: 1,
          backgroundImage: `linear-gradient(100deg, ${base} 30%, ${brillo} 50%, ${base} 70%)`,
          backgroundSize: '200% 100%',
          animationName: 'bah-brillo',
          animationDuration: '1.2s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
        }),
        style,
      ]}
    />
  )
}

type Variante = 'ficha' | 'portadas' | 'baldas'

/** La silueta de una pantalla entera mientras carga. */
const Esqueleto: React.FC<{ variante: Variante; ancho?: number; testID?: string }> = ({
  variante,
  ancho = 390,
  testID,
}) => {
  const contenedor = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: 'Cargando…',
    testID: testID ?? `esqueleto-${variante}`,
  }
  if (variante === 'ficha') {
    const anchoTapa = ancho >= 720 ? 220 : Math.min(200, ancho * 0.52)
    const fila = ancho >= 720
    return (
      <View {...contenedor} style={[styles.ficha, fila && styles.fichaFila]}>
        <View style={styles.tapa}>
          <Placa ancho={anchoTapa} alto={Math.round(anchoTapa * 1.5)} radio={4} />
        </View>
        <View style={[styles.datos, fila && styles.datosFila]}>
          <Placa ancho="80%" alto={34} style={styles.centro} />
          <Placa ancho="55%" alto={22} style={styles.centro} />
          <Placa ancho="40%" alto={14} style={styles.centro} />
          <Placa ancho="100%" alto={44} radio={12} />
          <View style={styles.botones}>
            <Placa ancho="48%" alto={52} radio={12} />
            <Placa ancho="48%" alto={52} radio={12} />
          </View>
        </View>
      </View>
    )
  }
  if (variante === 'portadas') {
    const columnas = ancho >= 1100 ? 6 : ancho >= 720 ? 4 : 2
    const w = Math.min(150, (ancho - 32 - (columnas - 1) * 16) / columnas)
    return (
      <View {...contenedor} style={styles.rejilla}>
        {Array.from({ length: columnas * 2 }, (_, i) => (
          <View key={i} style={{ width: w, gap: 8 }}>
            <Placa ancho={w} alto={Math.round(w * 1.5)} radio={4} />
            <Placa ancho="85%" alto={14} />
            <Placa ancho="55%" alto={12} />
          </View>
        ))}
      </View>
    )
  }
  // Baldas: lomos de alturas distintas sobre dos estantes.
  const altos = [148, 132, 156, 140, 126, 152, 136, 160, 130, 146]
  return (
    <View {...contenedor} style={styles.baldas}>
      {[0, 1].map((b) => (
        <View key={b} style={styles.balda}>
          {altos.slice(0, Math.max(5, Math.floor((ancho - 32) / 52))).map((h, i) => (
            <Placa key={i} ancho={44} alto={h - b * 8} radio={3} />
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  ficha: { padding: 16, gap: 16, alignItems: 'center', width: '100%', maxWidth: 980, alignSelf: 'center' },
  fichaFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  tapa: { padding: 24 },
  datos: { width: '100%', gap: 12, alignItems: 'stretch' },
  datosFila: { flex: 1, paddingTop: 12 },
  centro: { alignSelf: 'center' },
  botones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16 },
  baldas: { gap: 28, padding: 16 },
  balda: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, overflow: 'hidden' },
})

export default Esqueleto
