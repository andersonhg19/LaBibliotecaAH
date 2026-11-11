import React from 'react'

import { StyleSheet, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { spacing } from '@tema'

/*
 * UN FALLO EN UNA PANTALLA NO PUEDE APAGAR TODA LA APP.
 *
 * Sin esto, un error al pintar (un estado que la pantalla no conocia, un dato
 * que llego vacio) desmontaba el arbol entero: la app quedaba en blanco, sin
 * menu ni flecha atras, y la unica salida era recargar. Ahora el fallo se
 * queda en la pantalla que lo tuvo, se dice en palabras normales y hay dos
 * salidas: volver al inicio o intentarlo otra vez.
 */

interface Props {
  children: React.ReactNode
  /** Si no se pasa, no se ofrece "Volver al inicio" (p. ej. fuera de la navegacion). */
  onVolverAlInicio?: () => void
  /** Para el registro en consola: en que pantalla paso. */
  nombre?: string
}

interface Estado {
  error: Error | null
}

export const TarjetaDeFallo: React.FC<{ onReintentar: () => void; onVolverAlInicio?: () => void }> = ({
  onReintentar,
  onVolverAlInicio,
}) => {
  const { colors } = useTheme()
  return (
    <View style={[styles.pantalla, { backgroundColor: colors.background }]} testID="limite-de-errores">
      <View
        style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityRole="alert"
      >
        <AppText variant="title" style={styles.icono}>
          ⚠️
        </AppText>
        <AppText variant="subtitle" align="center">
          Algo salió mal en esta pantalla
        </AppText>
        <AppText variant="body" align="center" color={colors.textSecondary} style={styles.detalle}>
          Tus datos están bien. Puedes volver al inicio o intentarlo otra vez.
        </AppText>
        {onVolverAlInicio && <Button title="Volver al inicio" onPress={onVolverAlInicio} style={styles.boton} />}
        <Button title="Reintentar" onPress={onReintentar} variant="outline" style={styles.boton} />
      </View>
    </View>
  )
}

class ErrorBoundary extends React.Component<Props, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Que quede rastro: sin esto el fallo se veria solo como una tarjeta.
    console.error(`[ErrorBoundary${this.props.nombre ? `:${this.props.nombre}` : ''}]`, error, info?.componentStack)
  }

  reintentar = () => this.setState({ error: null })

  volverAlInicio = () => {
    this.setState({ error: null })
    this.props.onVolverAlInicio?.()
  }

  render() {
    if (this.state.error) {
      return (
        <TarjetaDeFallo
          onReintentar={this.reintentar}
          onVolverAlInicio={this.props.onVolverAlInicio ? this.volverAlInicio : undefined}
        />
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  tarjeta: { borderRadius: 16, borderWidth: 1, padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  icono: { fontSize: 48 },
  detalle: { marginBottom: spacing.sm },
  boton: { alignSelf: 'stretch' },
})

export default ErrorBoundary
