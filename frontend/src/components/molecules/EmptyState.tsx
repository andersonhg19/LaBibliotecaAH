import React from 'react'

import { StyleSheet, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { spacing } from '@tema'

interface EmptyStateProps {
  title: string
  message: string
  icon?: string
  children?: React.ReactNode
}

/** Un hueco vacío del estante, dicho con calma y con una salida si la hay. */
const EmptyState: React.FC<EmptyStateProps> = ({ title, message, icon = 'lomos', children }) => {
  const { colors } = useTheme()
  return (
    <View style={styles.container}>
      <View style={[styles.medallon, { borderColor: colors.primaryLight }]}>
        <Icono nombre={icon} color={colors.primaryLight} tamano={40} />
      </View>
      <AppText variant="subtitle" align="center" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} align="center">
        {message}
      </AppText>
      {children ? <View style={styles.acciones}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  medallon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { marginBottom: spacing.xs },
  acciones: { marginTop: spacing.md, gap: spacing.sm, alignSelf: 'stretch', maxWidth: 360, width: '100%' },
})

export default EmptyState
