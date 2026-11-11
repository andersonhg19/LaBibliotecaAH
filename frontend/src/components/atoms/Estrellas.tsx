import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg'

import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

const ESTRELLA = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'

interface Props {
  valor: number | null
  onCambiar?: (v: number | null) => void
  tamano?: number
  /** Mientras se guarda, no se admite otro toque. */
  disabled?: boolean
}

const Estrella: React.FC<{ llenado: number; tamano: number; color: string; id: string }> = ({
  llenado,
  tamano,
  color,
  id,
}) => (
  <Svg width={tamano} height={tamano} viewBox="0 0 24 24" pointerEvents="none">
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

/**
 * Lo que vale la calificación al tocar la estrella `i`: la estrella entera; si
 * ya estaba entera, media (y al revés). Así se llega a 3,5 sin tener que
 * acertar con media estrella de 22 px (UX-07).
 */
export const siguienteCalificacion = (actual: number | null, i: number): number =>
  actual === i ? i - 0.5 : actual === i - 0.5 ? i : i

/*
 * Calificación de media en media estrella (0,5 a 5). Cada estrella es UN
 * objetivo de 44 px (antes, dos mitades de 22): tocarla la llena; tocarla otra
 * vez la deja en media. "Quitar" borra la calificación (BI-07, el servidor
 * recibe null). Se anuncia como "4,5 de 5 estrellas", no solo con el dorado.
 */
const Estrellas: React.FC<Props> = ({ valor, onCambiar, tamano = 28, disabled }) => {
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
    <View style={styles.fila}>
      <View style={styles.fila} accessibilityRole="radiogroup" accessibilityLabel={`Calificación: ${texto}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable
            key={i}
            style={[styles.celda, { width: Math.max(44, tamano + 12) }, web({ cursor: 'pointer' })]}
            onPress={() => onCambiar(siguienteCalificacion(valor, i))}
            disabled={disabled}
            {...estadoElegible('radio', valor != null && Math.ceil(valor) === i, disabled)}
            accessibilityLabel={`${i} ${i === 1 ? 'estrella' : 'estrellas'}`}
            accessibilityHint="Toca otra vez para media estrella"
            testID={`estrella-${i}`}
          >
            <Estrella id={`ec${i}`} llenado={llenadoDe(v, i)} tamano={tamano} color={colors.primaryLight} />
          </Pressable>
        ))}
      </View>
      {valor != null ? (
        <Pressable
          onPress={() => onCambiar(null)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Quitar la calificación"
          testID="quitar-calificacion"
          style={[styles.quitar, web({ cursor: 'pointer' })]}
        >
          <Text style={[styles.quitarTexto, { color: colors.textSecondary }]}>Quitar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  celda: { height: 44, alignItems: 'center', justifyContent: 'center' },
  quitar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  quitarTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, textDecorationLine: 'underline' },
})

export default Estrellas
