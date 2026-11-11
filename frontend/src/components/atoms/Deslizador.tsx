import React from 'react'

import { Pressable, StyleSheet, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { useTheme } from '@contextos/ThemeContext'

export interface PropsDeslizador {
  valor: number
  min: number
  max: number
  paso: number
  etiqueta: string
  /** Texto que se anuncia del valor (aria-valuetext): "capítulo 3, 42 %". */
  textoValor?: (v: number) => string
  /** Mientras se arrastra. */
  onCambio?: (v: number) => void
  /** Al soltar. */
  onSoltar: (v: number) => void
  testID?: string
}

/*
 * Versión NO web (pruebas): dos botones − / + con el paso. La de la web
 * (Deslizador.web.tsx) es un <input type="range"> con estilo de latón.
 */
const Deslizador: React.FC<PropsDeslizador> = ({ valor, min, max, paso, etiqueta, onSoltar, textoValor, testID }) => {
  const { colors } = useTheme()
  const frac = max > min ? (valor - min) / (max - min) : 0
  return (
    <View
      style={styles.fila}
      testID={testID}
      accessibilityLabel={`${etiqueta}: ${textoValor ? textoValor(valor) : valor}`}
    >
      <Pressable
        style={styles.boton}
        onPress={() => onSoltar(Math.max(min, valor - paso))}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: menos`}
      >
        <Icono nombre="minus" color={colors.text} />
      </Pressable>
      <View style={[styles.pista, { backgroundColor: colors.border }]}>
        <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: colors.primary }} />
      </View>
      <Pressable
        style={styles.boton}
        onPress={() => onSoltar(Math.min(max, valor + paso))}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: más`}
      >
        <Icono nombre="plus" color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pista: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
})

export default Deslizador
