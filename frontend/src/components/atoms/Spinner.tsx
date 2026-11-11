import React from 'react'

import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'

interface SpinnerProps {
  size?: 'small' | 'large'
  fullScreen?: boolean
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'large', fullScreen = false }) => {
  const { colors } = useTheme()

  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size={size} color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default Spinner
