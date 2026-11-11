import React, { useSyncExternalStore } from 'react'

import { Platform, StyleSheet, View } from 'react-native'

import { Toast } from '@componentes/atoms/Toast'
import { ALTO_MINI } from '@componentes/lector/disenoLector'
import { useToast } from '@contextos/ToastContext'
import { useVoz } from '@contextos/VozContext'
import { web } from '@tema/web'

/*
 * Una pantalla con su propia barra de abajo (el lector) sube los avisos por
 * encima de ella mientras está abierta: elevarAvisos(72) devuelve cómo deshacerlo.
 */
let extra = 0
const oyentes = new Set<() => void>()
export function elevarAvisos(px: number): () => void {
  extra = px
  oyentes.forEach((o) => o())
  return () => {
    extra = 0
    oyentes.forEach((o) => o())
  }
}
const suscribir = (o: () => void) => {
  oyentes.add(o)
  return () => {
    oyentes.delete(o)
  }
}
const leerExtra = () => extra

/** Cuánto se separan los avisos del borde de abajo (encima del mini reproductor si suena algo). */
export const margenAvisos = (hayMini: boolean, encima = 0) => (hayMini ? ALTO_MINI : 0) + 20 + encima

/*
 * Los avisos van ABAJO (QA RW-04): arriba tapaban la cabecera y se comían el
 * toque en «Volver» durante 3 s. La capa deja pasar los toques (`box-none`):
 * solo la tira del aviso los recibe.
 */
export const ToastContainer: React.FC = () => {
  const { toasts, hideToast } = useToast()
  const voz = useVoz()
  const hayMini = !!voz.libro && voz.fase !== 'inactivo'
  const encima = useSyncExternalStore(suscribir, leerExtra, leerExtra)

  if (toasts.length === 0) return null

  const abajo = margenAvisos(hayMini, encima)
  return (
    <View
      testID="avisos"
      style={[
        styles.container,
        { bottom: Platform.OS === 'web' ? abajo : abajo + 24 },
        web({ position: 'fixed', bottom: `calc(${abajo}px + env(safe-area-inset-bottom))` }),
      ]}
      pointerEvents="box-none"
    >
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
    left: 0,
    right: 0,
    zIndex: 9999,
  },
})
