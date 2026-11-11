import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import { OpcionModo } from '@componentes/lector/modoLectura'
import type { ModoLector } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

/*
 * «CÓMO LEER»: las tres maneras de leer como tres tarjetas con su dibujo
 * (una página, hojas una debajo de otra, el libro abierto), en un grupo de
 * radio. Es lo primero de «Leer a tu manera».
 */
const Dibujo: React.FC<{ modo: ModoLector; tinta: string; papel: string }> = ({ modo, tinta, papel }) => {
  const hoja = (k: string, extra: object) => (
    <View key={k} style={[styles.hoja, { backgroundColor: papel, borderColor: tinta }, extra]}>
      <View style={[styles.renglon, { backgroundColor: tinta }]} />
      <View style={[styles.renglon, { backgroundColor: tinta, width: '70%' }]} />
      <View style={[styles.renglon, { backgroundColor: tinta, width: '85%' }]} />
    </View>
  )
  if (modo === 'continuo')
    return (
      <View style={styles.dibujo}>
        {hoja('a', { height: 22 })}
        {hoja('b', { height: 22, marginTop: 4 })}
      </View>
    )
  if (modo === 'libro')
    return (
      <View style={[styles.dibujo, styles.fila]}>
        {hoja('a', { width: 22, height: 34 })}
        {hoja('b', { width: 22, height: 34, marginLeft: 2 })}
      </View>
    )
  return <View style={styles.dibujo}>{hoja('a', { height: 34 })}</View>
}

const SelectorModo: React.FC<{
  opciones: OpcionModo[]
  actual: ModoLector
  onElegir: (m: ModoLector) => void
}> = ({ opciones, actual, onElegir }) => {
  const { colors, isDark } = useTheme()
  return (
    <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel="Cómo leer" testID="selector-modo">
      {opciones.map((o) => {
        const activo = o.modo === actual
        return (
          <Pressable
            key={o.modo}
            onPress={() => onElegir(o.modo)}
            {...estadoElegible('radio', activo)}
            accessibilityLabel={`${o.nombre}: ${o.detalle}`}
            testID={`modo-${o.modo}`}
            style={({ pressed }) => [
              styles.tarjeta,
              { borderColor: activo ? colors.primaryLight : colors.border, backgroundColor: colors.card },
              activo && web(placaActiva(isDark)),
              pressed && { opacity: 0.85 },
              web({ cursor: 'pointer', transition: 'transform 140ms ease' }),
            ]}
          >
            <Dibujo modo={o.modo} tinta={activo ? colors.text : colors.textMuted} papel={colors.surfaceLight} />
            <Text style={[styles.nombre, { color: colors.text }]}>{o.nombre}</Text>
            <Text style={[styles.detalle, { color: colors.textSecondary }]}>{o.detalle}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grupo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tarjeta: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    alignItems: 'center',
  },
  dibujo: { height: 52, alignItems: 'center', justifyContent: 'center' },
  fila: { flexDirection: 'row' },
  hoja: { width: 30, borderWidth: 1, borderRadius: 2, padding: 4, gap: 3 },
  renglon: { height: 2, width: '100%', opacity: 0.6, borderRadius: 1 },
  nombre: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  detalle: { fontFamily: fuentes.ui, fontSize: fontSize.xs, textAlign: 'center' },
})

export default SelectorModo
