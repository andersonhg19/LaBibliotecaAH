import React from 'react'

import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native'

import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { textoLegibleSobre } from '@tema/contraste'

interface Props {
  visible: boolean
  onSeguir: () => void
  onDescartar: () => void
  mensaje?: string
}

/*
 * "¿Descartar lo escrito?". Cerrar el formulario con un monto ya escrito lo
 * borraba sin preguntar. Es una hoja de la app y no window.confirm: el dialogo
 * del navegador no se parece a nada de la app y en algunos moviles ni sale.
 * El boton grande es seguir escribiendo; descartar es la accion secundaria.
 */
const ConfirmarDescarte: React.FC<Props> = ({ visible, onSeguir, onDescartar, mensaje }) => {
  const { colors } = useTheme()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSeguir}>
      <View style={styles.fondo}>
        <View style={[styles.caja, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <AppText variant="subtitle">¿Descartar lo escrito?</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {mensaje || 'Todavía no se ha anotado. Si sales ahora, se pierde.'}
          </AppText>
          <TouchableOpacity
            style={[styles.boton, { backgroundColor: colors.primary }]}
            onPress={onSeguir}
            accessibilityRole="button"
            accessibilityLabel="Seguir escribiendo"
          >
            <AppText variant="body" style={{ fontWeight: '800', color: textoLegibleSobre(colors.primary) }}>
              Seguir escribiendo
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.boton, { borderWidth: 1, borderColor: colors.border }]}
            onPress={onDescartar}
            accessibilityRole="button"
            accessibilityLabel="Descartar"
          >
            <AppText variant="body" style={{ fontWeight: '700', color: colors.danger }}>
              Descartar
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  caja: { borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' },
  boton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
})

export default ConfirmarDescarte
