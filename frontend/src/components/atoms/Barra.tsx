import React from 'react'

import { View } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { web } from '@tema/web'

interface Props {
  /** 0..100 */
  porcentaje: number
  alto?: number
  color?: string
  etiqueta?: string
}

/** Barra de progreso fina con brillo de latón. Lleva su porcentaje en el nombre accesible. */
const Barra: React.FC<Props> = ({ porcentaje, alto = 4, color, etiqueta }) => {
  const { colors } = useTheme()
  const p = Math.max(0, Math.min(100, porcentaje || 0))
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${etiqueta ?? 'Progreso'}: ${Math.round(p)} %`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
      style={{ height: alto, borderRadius: alto, backgroundColor: colors.border, overflow: 'hidden' }}
    >
      <View
        style={[
          { width: `${p}%`, height: '100%', backgroundColor: color ?? colors.primary, borderRadius: alto },
          web({ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,240,200,0.45))' }),
        ]}
      />
    </View>
  )
}

export default Barra
