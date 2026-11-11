import React from 'react'

import { Platform, StyleSheet, View } from 'react-native'

import { Toast } from '@componentes/atoms/Toast'
import { useToast } from '@contextos/ToastContext'

export const ToastContainer: React.FC = () => {
  const { toasts, hideToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onDismiss={() => hideToast(toast.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 50,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
})
