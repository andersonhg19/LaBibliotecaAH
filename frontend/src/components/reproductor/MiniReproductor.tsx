import React from 'react'

import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { motor, useVoz } from '@contextos/VozContext'
import { textoVelocidad } from '@logica/velocidad'
import { fontSize, fuentes } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { web } from '@tema/web'

/*
 * EL MINI REPRODUCTOR: la voz sigue sonando mientras recorres la biblioteca.
 * Una franja de cuero al pie de todas las salas con el capítulo, la barra de
 * avance y ⏪ ⏯ ⏩. Tocar el título abre el reproductor completo.
 */
const MiniReproductor: React.FC<{ onAbrir: (ejemplarId: string) => void }> = ({ onAbrir }) => {
  const { colors } = useTheme()
  const v = useVoz()
  const { width } = useWindowDimensions()
  if (!v.libro || v.fase === 'inactivo') return null
  const cap = v.libro.capitulos.find((c) => c.indice === v.capitulo)
  const sonando = v.fase === 'reproduciendo'
  const ocupado = v.fase === 'cargando' || v.fase === 'preparando'
  const frac = v.duracion ? Math.min(1, v.posicion / v.duracion) : 0
  const ancho = width >= 820
  const subtitulo = v.mensaje ?? (cap ? cap.titulo : `Capítulo ${v.capitulo + 1}`)
  return (
    <View
      testID="mini-reproductor"
      style={[
        styles.barra,
        { backgroundColor: colors.surface, borderTopColor: colors.primaryLight },
        web({
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
        }),
      ]}
      accessibilityRole="toolbar"
      accessibilityLabel="Reproductor"
    >
      <View style={[styles.avance, { backgroundColor: colors.border }]}>
        <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: colors.primary }} />
      </View>
      <View style={[styles.fila, ancho && styles.filaAncha]}>
        <Pressable
          style={styles.info}
          onPress={() => onAbrir(v.libro!.ejemplarId)}
          accessibilityRole="button"
          accessibilityLabel={`Abrir el reproductor: ${v.libro.titulo}, ${subtitulo}`}
        >
          <Icono nombre="auriculares" color={colors.primary} tamano={24} />
          <View style={styles.textos}>
            <Text numberOfLines={1} style={[styles.titulo, { color: colors.text }]}>
              {v.libro.titulo}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.sub, { color: v.fase === 'error' ? colors.danger : colors.textSecondary }]}
            >
              {subtitulo} · {textoVelocidad(v.velocidad)}
            </Text>
          </View>
        </Pressable>
        <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={motor.atras15} />
        <Pressable
          onPress={() => motor.alternar()}
          accessibilityRole="button"
          accessibilityLabel={sonando ? 'Pausar' : 'Reproducir'}
          testID="mini-alternar"
          style={[styles.play, { backgroundColor: colors.primary }]}
        >
          {ocupado ? (
            <ActivityIndicator color={textoLegibleSobre(colors.primary)} />
          ) : (
            <Icono nombre={sonando ? 'pause' : 'play'} color={textoLegibleSobre(colors.primary)} relleno tamano={22} />
          )}
        </Pressable>
        <BotonIcono icono="adelante15" etiqueta="Adelantar 15 segundos" onPress={motor.adelante15} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: { borderTopWidth: 1 },
  avance: { height: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  filaAncha: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  textos: { flex: 1 },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  sub: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
})

export default MiniReproductor
