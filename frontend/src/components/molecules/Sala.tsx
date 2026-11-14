import React from 'react'

import { StyleSheet, View, ViewStyle } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { fondoSala } from '@tema/madera'
import { web } from '@tema/web'

/*
 * El fondo de cada sala: pared de madera con la luz cálida de la lámpara
 * arriba y una viñeta abajo (o pergamino iluminado de día). Es la "habitación"
 * en la que pasa todo lo demás.
 */
const Sala: React.FC<{ children: React.ReactNode; style?: ViewStyle; testID?: string }> = ({
  children,
  style,
  testID,
}) => {
  const { colors, isDark } = useTheme()
  return (
    <View
      testID={testID}
      role="main"
      style={[
        styles.sala,
        { backgroundColor: colors.background },
        web({ backgroundImage: fondoSala(isDark), backgroundAttachment: 'fixed' }),
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({ sala: { flex: 1 } })

export default Sala
