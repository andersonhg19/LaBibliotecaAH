import React, { useEffect, useId } from 'react'

import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'

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
  /** Opcional: la ref del cuerpo desplazable (para llevar a la vista lo elegido al abrir). */
  refScroll?: React.Ref<ScrollView>
}

/*
 * Una hoja que sube desde abajo en el teléfono y una ventana centrada en el
 * PC. Papel sobre madera: el borde de arriba lleva un filete de latón.
 *
 * Accesible (UX5-05): el diálogo se llama como su título, el velo de detrás
 * cierra al tocarlo pero NO es una parada de Tab (no recibe el foco), y al
 * abrir el foco va al título de la hoja, dentro de ella.
 */

/** El velo: cierra al tocarlo, sin ser un botón que el teclado tenga que atravesar. */
export const Velo: React.FC<{ onCerrar: () => void; testID?: string }> = ({ onCerrar, testID = 'velo' }) => (
  <View
    style={StyleSheet.absoluteFill}
    aria-hidden
    accessible={false}
    importantForAccessibility="no-hide-descendants"
    onStartShouldSetResponder={() => true}
    onResponderRelease={onCerrar}
    testID={testID}
  />
)

/** Al abrir, el foco al elemento `id` (el título), sin contorno de ratón. */
export function useFocoInicial(visible: boolean, id: string) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return
    const t = setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }, 60)
    return () => clearTimeout(t)
  }, [visible, id])
}
const Hoja: React.FC<Props> = ({ visible, titulo, onCerrar, children, ancho = 560, testID, refScroll }) => {
  const { colors, isDark } = useTheme()
  const { width, height } = useWindowDimensions()
  const escritorio = width >= 820
  const idTitulo = `hoja-titulo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  useFocoInicial(visible, idTitulo)
  return (
    <Modal
      visible={visible}
      transparent
      animationType={escritorio ? 'fade' : 'slide'}
      onRequestClose={onCerrar}
      {...({ 'aria-label': titulo } as object)}
    >
      <View
        style={[styles.fondo, { backgroundColor: colors.velo, justifyContent: escritorio ? 'center' : 'flex-end' }]}
      >
        <Velo onCerrar={onCerrar} testID={testID ? `${testID}-velo` : 'hoja-velo'} />
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
            <AppText
              variant="subtitle"
              style={styles.titulo}
              numberOfLines={2}
              accessibilityRole="header"
              nativeID={idTitulo}
            >
              {titulo}
            </AppText>
            <BotonIcono icono="close" etiqueta="Cerrar" onPress={onCerrar} />
          </View>
          <ScrollView ref={refScroll} contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
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
