import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

export interface Segmento<T extends string> {
  clave: T
  nombre: string
  testID?: string
}

interface Props<T extends string> {
  opciones: Segmento<T>[]
  valor: T
  onCambiar: (v: T) => void
  /** Nombre del grupo para el lector de pantalla ("Cómo ver la biblioteca"). */
  etiqueta: string
  testID?: string
}

/*
 * Un control segmentado de latón: opciones excluyentes (radiogroup), la
 * elegida como una placa de latón pulida. Lo usan "Estantería · Catálogo" y
 * "Colecciones · Géneros · Autores".
 */
function Segmentos<T extends string>({ opciones, valor, onCambiar, etiqueta, testID }: Props<T>) {
  const { colors, isDark } = useTheme()
  return (
    <View
      style={[styles.segmentos, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={etiqueta}
      testID={testID}
    >
      {opciones.map((o) => {
        const activo = valor === o.clave
        return (
          <Pressable
            key={o.clave}
            onPress={() => onCambiar(o.clave)}
            {...estadoElegible('radio', activo)}
            accessibilityLabel={o.nombre}
            testID={o.testID}
            style={[
              styles.segmento,
              activo && { borderColor: colors.primaryLight },
              activo && web(placaActiva(isDark)),
              web({ cursor: 'pointer' }),
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.texto,
                { color: activo ? colors.text : colors.textSecondary },
                activo && styles.textoActivo,
              ]}
            >
              {o.nombre}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  segmentos: { flexDirection: 'row', borderWidth: 1, borderRadius: 22, padding: 2 },
  segmento: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  texto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  textoActivo: { fontFamily: fuentes.uiSemi },
})

export default Segmentos
