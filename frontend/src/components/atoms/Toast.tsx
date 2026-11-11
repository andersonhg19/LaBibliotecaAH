import React, { useEffect, useRef } from 'react'

import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'

import type { ToastType } from '@contextos/ToastContext'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { fibraPapel } from '@tema/madera'
import { SOMBRA } from '@tema/materiales'
import { reducirMovimiento, web } from '@tema/web'

interface ToastProps {
  type: ToastType
  title: string
  message?: string
  onDismiss: () => void
}

/*
 * EL AVISO DE LA CASA (QA RW-04 y diseño 5): una tira de pergamino con filete
 * de latón que sube desde abajo, con un sello a la izquierda. Ya no es la
 * píldora verde menta genérica de arriba que tapaba la cabecera y el Volver.
 * El sello cambia según lo que pasó (latón: hecho; burdeos: error; miel:
 * cuidado; nogal: información) y lleva su marca, para no depender del color.
 */
const SELLO: Record<ToastType, { fondo: string; tinta: string; marca: string }> = {
  success: { fondo: paleta.laton, tinta: paleta.robleOscuro, marca: '✓' },
  error: { fondo: paleta.burdeos, tinta: paleta.pergamino, marca: '✗' },
  warning: { fondo: paleta.miel, tinta: paleta.robleOscuro, marca: '!' },
  info: { fondo: paleta.nogal, tinta: paleta.pergamino, marca: 'i' },
}

export const Toast: React.FC<ToastProps> = ({ type, title, message, onDismiss }) => {
  const sube = useRef(new Animated.Value(reducirMovimiento() ? 0 : 28)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sube, { toValue: 0, useNativeDriver: false, tension: 90, friction: 11 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false }),
    ]).start()
  }, [opacity, sube])

  const sello = SELLO[type]

  return (
    <Animated.View style={[styles.contenedor, { transform: [{ translateY: sube }], opacity }]} pointerEvents="box-none">
      {/* El aviso desaparece solo, así que se ANUNCIA al aparecer (`alert`): quien no
        mira la pantalla en ese momento no se lo pierde. Tocarlo lo cierra. */}
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${title}${message ? '. ' + message : ''}`}
        accessibilityHint="Toca para cerrar el aviso"
        onPress={onDismiss}
        testID={`aviso-${type}`}
        style={({ pressed }) => [
          styles.tira,
          { backgroundColor: paleta.pergamino, borderColor: paleta.laton },
          web({
            backgroundImage: `${fibraPapel}, linear-gradient(180deg, ${paleta.marfil}, ${paleta.pergamino})`,
            boxShadow: `${SOMBRA[2]}, inset 0 0 0 3px rgba(201,162,39,0.18)`,
            cursor: 'pointer',
          }),
          pressed && { opacity: 0.9 },
        ]}
      >
        <View
          style={[
            styles.sello,
            { backgroundColor: sello.fondo },
            web({
              backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), rgba(0,0,0,0.18))',
              boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.3)',
            }),
          ]}
        >
          <Text style={[styles.marca, { color: sello.tinta }]}>{sello.marca}</Text>
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo}>{title}</Text>
          {message ? <Text style={styles.mensaje}>{message}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  contenedor: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 16, marginTop: 8 },
  tira: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  sello: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  marca: { fontFamily: fuentes.uiSemi, fontSize: 14, lineHeight: 16 },
  textos: { flex: 1, gap: 1 },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md, color: paleta.robleOscuro, lineHeight: 20 },
  mensaje: { fontFamily: fuentes.ui, fontSize: fontSize.xs, color: paleta.nogal, lineHeight: 17 },
})
