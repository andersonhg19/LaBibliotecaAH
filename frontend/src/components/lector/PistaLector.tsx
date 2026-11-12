import React, { useEffect } from 'react'

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { fontSize, fuentes } from '@tema'
import { reducirMovimiento, web } from '@tema/web'

/*
 * LA PISTA DE LA PRIMERA VEZ: cuando la barra se esconde por primera vez, un
 * aviso suave en el centro enseña el gesto («toca el centro») y dónde está el
 * capítulo. Una sola vez por dispositivo; se va sola, al tocar el centro o al
 * tocarla. No tapa nada más que su propio rótulo (el resto deja pasar los toques).
 */

export const CLAVE_PISTA = '@biblioteca_ah_pista_lector_v1'
export const PISTA_DURA_MS = 7000

/** ¿Ya se enseñó la pista en este dispositivo? (si no se puede leer, se da por vista: mejor callar que repetir). */
export async function pistaVista(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE_PISTA)) === '1'
  } catch {
    return true
  }
}

export function marcarPistaVista() {
  AsyncStorage.setItem(CLAVE_PISTA, '1').catch((e) => console.warn('[lector] no se pudo recordar la pista', e))
}

function ponerAnimacion() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('bah-pista-estilos')) return
  const s = document.createElement('style')
  s.id = 'bah-pista-estilos'
  s.textContent =
    '@keyframes bahPulso{0%{transform:scale(.85);opacity:.9}70%{transform:scale(1.35);opacity:0}100%{opacity:0}}' +
    '@keyframes bahAparece{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
  document.head.appendChild(s)
}

interface Props {
  visible: boolean
  papel: { fondo: string; tinta: string }
  onCerrar: () => void
}

const PistaLector: React.FC<Props> = ({ visible, papel, onCerrar }) => {
  useEffect(() => ponerAnimacion(), [])
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(onCerrar, PISTA_DURA_MS)
    return () => clearTimeout(t)
  }, [visible, onCerrar])
  if (!visible) return null
  const quieto = reducirMovimiento()
  return (
    <View
      pointerEvents="box-none"
      style={[styles.capa, web({ position: 'absolute', left: 0, right: 0, top: '38%' })]}
      testID="pista-lector"
    >
      <Pressable
        onPress={onCerrar}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel="Consejo: toca el centro de la página para ver los controles y cambiar de capítulo. Tocar para cerrar"
        style={[
          styles.tarjeta,
          { backgroundColor: papel.fondo, borderColor: 'rgba(201,162,39,0.55)' },
          web({
            boxShadow: '0 10px 28px rgba(0,0,0,0.3)',
            animation: quieto ? undefined : 'bahAparece 260ms ease-out',
            cursor: 'pointer',
          }),
        ]}
      >
        <View style={styles.dedo}>
          <View
            style={[
              styles.anillo,
              web({ animation: quieto ? undefined : 'bahPulso 1.6s ease-out 3', borderColor: '#C9A227' }),
            ]}
          />
          <View style={styles.punto} />
        </View>
        <Text style={[styles.texto, { color: papel.tinta }]}>
          Toca el centro de la página para ver los controles y cambiar de capítulo.
        </Text>
        <Text style={[styles.sub, { color: papel.tinta }]}>Abajo siempre ves en qué capítulo vas.</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  capa: { alignItems: 'center', zIndex: 40 },
  tarjeta: {
    maxWidth: 300,
    minHeight: 44,
    marginHorizontal: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  dedo: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  anillo: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#C9A227' },
  punto: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#C9A227' },
  texto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.xs, lineHeight: 20, textAlign: 'center' },
  sub: { fontFamily: fuentes.ui, fontSize: fontSize.xs, lineHeight: 18, textAlign: 'center', opacity: 0.82 },
})

export default PistaLector
