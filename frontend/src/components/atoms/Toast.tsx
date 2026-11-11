import React, { useEffect, useRef } from 'react'

import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native'

import AppText from '@componentes/atoms/Text'
import { useTheme } from '@contextos/ThemeContext'
import type { ToastType } from '@contextos/ToastContext'

interface ToastProps {
  type: ToastType
  title: string
  message?: string
  onDismiss: () => void
}

const ICONS: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '!',
  info: 'i',
}

export const Toast: React.FC<ToastProps> = ({ type, title, message, onDismiss }) => {
  const { colors } = useTheme()
  const translateY = useRef(new Animated.Value(-100)).current
  const opacity = useRef(new Animated.Value(0)).current

  const accentColors: Record<ToastType, string> = {
    success: colors.success,
    error: colors.danger,
    warning: colors.warning,
    info: colors.primary,
  }

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY])

  const accent = accentColors[type]

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }], opacity }]}>
      {/* El aviso desaparece solo, asi que si no se ANUNCIA al aparecer, quien
        no mira la pantalla en ese momento se lo pierde entero. `alert` hace
        que el lector lo lea en cuanto sale, sin esperar turno. */}
      <TouchableOpacity
        accessibilityRole="alert"
        accessibilityLabel={`${title}${message ? '. ' + message : ''}`}
        activeOpacity={0.9}
        onPress={onDismiss}
        style={[
          styles.toast,
          {
            backgroundColor: colors.surface,
            borderLeftColor: accent,
            shadowColor: '#000',
            minHeight: 48,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: accent }]}>
          <AppText style={styles.iconText}>{ICONS[type]}</AppText>
        </View>
        <View style={styles.textContainer}>
          <AppText variant="label" style={{ color: colors.text }}>
            {title}
          </AppText>
          {message ? (
            <AppText variant="caption" style={{ color: colors.textSecondary }}>
              {message}
            </AppText>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  textContainer: {
    flex: 1,
  },
})
