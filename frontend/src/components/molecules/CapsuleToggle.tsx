import React, { useEffect, useRef } from 'react'

import { Animated, DimensionValue, StyleSheet, TouchableOpacity, View } from 'react-native'

import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import { estadoElegible } from '@utils/aria'

interface Option {
  label: string
  value: string
  color: string
}

interface CapsuleToggleProps {
  options: Option[]
  selected: string
  onChange: (value: string) => void
}

const CapsuleToggle: React.FC<CapsuleToggleProps> = ({ options, selected, onChange }) => {
  const { colors } = useTheme()
  const selectedIndex = options.findIndex((o) => o.value === selected)
  const slideAnim = useRef(new Animated.Value(selectedIndex)).current

  useEffect(() => {
    if (options.length >= 2) {
      Animated.spring(slideAnim, {
        toValue: selectedIndex >= 0 ? selectedIndex : 0,
        useNativeDriver: false,
        tension: 100,
        friction: 12,
      }).start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slideAnim es un ref estable
  }, [selectedIndex, options.length])

  const selectedOption = options[selectedIndex] || options[0]

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.slider,
          {
            backgroundColor: selectedOption.color,
            width: `${100 / options.length}%` as DimensionValue,
            left:
              options.length >= 2
                ? slideAnim.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => `${(100 / options.length) * i}%`),
                  })
                : '0%',
          },
        ]}
      />
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={styles.option}
          onPress={() => onChange(option.value)}
          /*
           * `radio` y no `button`: son opciones excluyentes, y con `selected`
           * el lector anuncia CUAL esta puesta. Sin eso solo se sabe por el
           * color de fondo, que para mucha gente no es una senal.
           */
          {...estadoElegible('radio', option.value === selected)}
          accessibilityLabel={option.label}
          activeOpacity={0.7}
        >
          <AppText
            variant="label"
            style={[styles.label, { color: selected === option.value ? '#FFFFFF' : colors.textMuted }]}
          >
            {option.label}
          </AppText>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderRadius: 16,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  slider: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 14,
  },
  option: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    zIndex: 1,
  },
  label: {
    fontWeight: '600',
    fontSize: 15,
  },
})

export default CapsuleToggle
