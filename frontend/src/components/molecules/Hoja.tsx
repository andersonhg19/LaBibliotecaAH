import React from 'react'

import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'

import AppText from '@componentes/atoms/Text'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { hoja as materialHoja } from '@tema/materiales'
import { web } from '@tema/web'

interface Props {
  visible: boolean
  titulo: string
  onCerrar: () => void
  children: React.ReactNode
  /** Ancho máximo en escritorio. */
  ancho?: number
  testID?: string
}

/*
 * Una hoja que sube desde abajo en el teléfono y una ventana centrada en el
 * PC. Papel sobre madera: el borde de arriba lleva un filete de latón.
 */
const Hoja: React.FC<Props> = ({ visible, titulo, onCerrar, children, ancho = 560, testID }) => {
  const { colors, isDark } = useTheme()
  const { width, height } = useWindowDimensions()
  const escritorio = width >= 820
  return (
    <Modal visible={visible} transparent animationType={escritorio ? 'fade' : 'slide'} onRequestClose={onCerrar}>
      <View
        style={[styles.fondo, { backgroundColor: colors.velo, justifyContent: escritorio ? 'center' : 'flex-end' }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.hoja,
            {
              backgroundColor: colors.surface,
              borderColor: colors.primaryLight,
              maxHeight: height * (escritorio ? 0.86 : 0.9),
              maxWidth: escritorio ? ancho : undefined,
              borderRadius: escritorio ? 18 : 0,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
            },
            web(materialHoja(isDark, colors)),
          ]}
        >
          <View style={styles.cabecera}>
            <AppText variant="subtitle" style={styles.titulo} numberOfLines={2} accessibilityRole="header">
              {titulo}
            </AppText>
            <BotonIcono icono="close" etiqueta="Cerrar" onPress={onCerrar} />
          </View>
          <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fondo: { flex: 1, alignItems: 'center' },
  hoja: { width: '100%', borderTopWidth: 2, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 10 },
  titulo: { flex: 1 },
  cuerpo: { padding: 20, paddingTop: 8, gap: 12 },
})

export default Hoja
