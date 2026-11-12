import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

export interface AccionDeMenu {
  clave: string
  etiqueta: string
  icono: string
  onPress: () => void
  /** Borra o retira algo: en burdeos. */
  peligro?: boolean
  /** Opción de un grupo (orden): se marca la elegida. */
  elegida?: boolean
  /** Ayuda corta bajo la etiqueta. */
  detalle?: string
}

interface Props {
  visible: boolean
  titulo: string
  acciones: AccionDeMenu[]
  onCerrar: () => void
  testID?: string
}

/*
 * El menú de «⋯»: lo que no merece estar siempre a la vista (renombrar, mover,
 * borrar, ordenar). En el teléfono sube desde abajo; en el PC, ventana pequeña.
 * Cada fila mide 52 px: cómoda con el pulgar.
 */
const MenuAcciones: React.FC<Props> = ({ visible, titulo, acciones, onCerrar, testID }) => {
  const { colors } = useTheme()
  return (
    <Hoja visible={visible} titulo={titulo} onCerrar={onCerrar} ancho={420} testID={testID}>
      <View style={styles.lista}>
        {acciones.map((a) => {
          const color = a.peligro ? colors.danger : colors.text
          const eleccion =
            a.elegida === undefined ? { accessibilityRole: 'button' as const } : estadoElegible('radio', a.elegida)
          return (
            <Pressable
              key={a.clave}
              testID={`menu-${a.clave}`}
              {...eleccion}
              accessibilityLabel={a.detalle ? `${a.etiqueta}. ${a.detalle}` : a.etiqueta}
              onPress={() => {
                onCerrar()
                a.onPress()
              }}
              style={({ pressed }) => [
                styles.fila,
                { borderColor: colors.border },
                a.elegida && { backgroundColor: colors.surfaceLight },
                pressed && { opacity: 0.75 },
                web({ cursor: 'pointer' }),
              ]}
            >
              <Icono nombre={a.elegida ? 'check' : a.icono} color={a.elegida ? colors.primary : color} tamano={20} />
              <View style={styles.textos}>
                <Text style={[styles.etiqueta, { color }]}>{a.etiqueta}</Text>
                {a.detalle ? <Text style={[styles.detalle, { color: colors.textMuted }]}>{a.detalle}</Text> : null}
              </View>
            </Pressable>
          )
        })}
      </View>
    </Hoja>
  )
}

const styles = StyleSheet.create({
  lista: { gap: 6 },
  fila: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  textos: { flex: 1, gap: 2 },
  etiqueta: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  detalle: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
})

export default MenuAcciones
