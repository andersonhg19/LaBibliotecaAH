import React from 'react'

import { StyleSheet, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { spacing } from '@tema'

interface EstadoErrorProps {
  mensaje: string
  onReintentar: () => void
  titulo?: string
}

/*
 * El gemelo malvado de EmptyState: un fallo NO se ve igual que "aún no hay
 * libros". Siempre dice el motivo y siempre ofrece Reintentar.
 */
const EstadoError: React.FC<EstadoErrorProps> = ({ mensaje, onReintentar, titulo = 'No se pudo cargar' }) => {
  const { colors } = useTheme()
  return (
    <View style={styles.container} testID="estado-error" accessibilityRole="alert">
      <Icono nombre="shield" color={colors.danger} tamano={48} />
      <AppText variant="subtitle" align="center" style={styles.titulo}>
        {titulo}
      </AppText>
      <AppText variant="body" color={colors.danger} align="center" style={styles.mensaje}>
        {mensaje}
      </AppText>
      <Button title="Reintentar" onPress={onReintentar} variant="outline" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  titulo: { marginTop: spacing.sm },
  mensaje: { marginBottom: spacing.md },
})

export default EstadoError
