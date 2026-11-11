import React from 'react'

import { Pressable, StyleSheet, View } from 'react-native'

import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg'

import { useTheme } from '@contextos/ThemeContext'
import { web } from '@tema/web'

const ESTRELLA = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'

interface Props {
  valor: number | null
  onCambiar?: (v: number | null) => void
  tamano?: number
}

const Estrella: React.FC<{ llenado: number; tamano: number; color: string; id: string }> = ({
  llenado,
  tamano,
  color,
  id,
}) => (
  <Svg width={tamano} height={tamano} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
    <Defs>
      <ClipPath id={id}>
        <Rect x="0" y="0" width={24 * llenado} height="24" />
      </ClipPath>
    </Defs>
    <Path d={ESTRELLA} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    {llenado > 0 ? <Path d={ESTRELLA} fill={color} clipPath={`url(#${id})`} /> : null}
  </Svg>
)

const llenadoDe = (v: number, i: number) => Math.max(0, Math.min(1, v - (i - 1)))
const decir = (x: number) => String(x).replace('.', ',')

/*
 * Calificación de media en media estrella (0.5 a 5). Cada estrella tiene dos
 * mitades tocables; tocar el valor actual lo borra. Se anuncia como "4,5 de 5
 * estrellas", no solo con el dorado.
 */
const Estrellas: React.FC<Props> = ({ valor, onCambiar, tamano = 28 }) => {
  const { colors } = useTheme()
  const v = valor ?? 0
  const texto = valor ? `${decir(valor)} de 5 estrellas` : 'Sin calificar'
  if (!onCambiar) {
    return (
      <View style={styles.fila} accessible accessibilityLabel={texto}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Estrella key={i} id={`e${i}`} llenado={llenadoDe(v, i)} tamano={tamano} color={colors.primaryLight} />
        ))}
      </View>
    )
  }
  return (
    <View style={styles.fila} accessibilityLabel={`Calificación: ${texto}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.celda, { width: Math.max(44, tamano + 8) }]}>
          <Estrella id={`ec${i}`} llenado={llenadoDe(v, i)} tamano={tamano} color={colors.primaryLight} />
          <View style={[StyleSheet.absoluteFill, styles.mitades]}>
            {[i - 0.5, i].map((x) => (
              <Pressable
                key={x}
                style={[styles.mitad, web({ cursor: 'pointer' })]}
                onPress={() => onCambiar(x === valor ? null : x)}
                accessibilityRole="button"
                accessibilityLabel={`${decir(x)} estrellas`}
                accessibilityState={{ selected: x === valor }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center' },
  celda: { height: 44, alignItems: 'center', justifyContent: 'center' },
  mitades: { flexDirection: 'row' },
  mitad: { flex: 1, minHeight: 44 },
})

export default Estrellas
