import React from 'react'

import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { ALTO_MINI, SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { OndaVoz } from '@componentes/reproductor/ControlesVoz'
import { avisoDeVoz } from '@componentes/reproductor/estadoVoz'
import { useAhora } from '@componentes/reproductor/useAhora'
import { useTheme } from '@contextos/ThemeContext'
import { motor, useVoz } from '@contextos/VozContext'
import { textoVelocidad } from '@logica/velocidad'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'

/*
 * EL MINI REPRODUCTOR: la voz sigue sonando mientras recorres la biblioteca.
 * Una franja de cuero al pie de todas las salas con un hilo de latón que avanza,
 * el capítulo, ⏪ ⏯ ⏩ y ✕ para cerrarla. Tocar el título abre el reproductor
 * completo. Mientras el taller prepara la voz dice cuánto falta («≈ 20 s»); si
 * algo falla, ▶ reintenta.
 */
const MiniReproductor: React.FC<{ onAbrir: (ejemplarId: string) => void }> = ({ onAbrir }) => {
  const { colors } = useTheme()
  const v = useVoz()
  const { width } = useWindowDimensions()
  const esperando = v.fase === 'preparando' || !!v.vozPendiente
  const ahora = useAhora(esperando)
  if (!v.libro || v.fase === 'inactivo') return null
  const cap = v.libro.capitulos.find((c) => c.indice === v.capitulo)
  const sonando = v.fase === 'reproduciendo'
  const ocupado = v.fase === 'cargando' || v.fase === 'preparando'
  const enError = v.fase === 'error'
  const frac = v.duracion ? Math.min(1, v.posicion / v.duracion) : 0
  const ancho = width >= 820
  const aviso = avisoDeVoz(v, ahora)
  const subtitulo = aviso?.texto ?? (cap ? cap.titulo : `Capítulo ${v.capitulo + 1}`)
  const etiquetaPlay = sonando ? 'Pausar' : enError ? 'Reintentar' : 'Reproducir'
  return (
    <View
      testID="mini-reproductor"
      style={[
        styles.barra,
        { backgroundColor: colors.surface, borderTopColor: SALA_ESCUCHA.latonOscuro },
        web({
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.12))',
        }),
      ]}
      accessibilityRole="toolbar"
      accessibilityLabel="Reproductor"
    >
      {/* El hilo de latón: lo que va del capítulo. */}
      <View style={[styles.avance, { backgroundColor: 'rgba(201,162,39,0.18)' }]}>
        <View
          style={[
            styles.hilo,
            { width: `${frac * 100}%`, backgroundColor: SALA_ESCUCHA.laton },
            web({ boxShadow: '0 0 6px rgba(201,162,39,0.6)', transition: 'width 400ms linear' }),
          ]}
        />
      </View>
      <View style={[styles.fila, ancho && styles.filaAncha]}>
        <Pressable
          style={styles.info}
          onPress={() => onAbrir(v.libro!.ejemplarId)}
          accessibilityRole="button"
          accessibilityLabel={`Abrir el reproductor: ${v.libro.titulo}, ${subtitulo}`}
        >
          {sonando ? (
            <View style={styles.onda}>
              <OndaVoz activa />
            </View>
          ) : (
            <Icono nombre="auriculares" color={SALA_ESCUCHA.laton} tamano={24} />
          )}
          <View style={styles.textos}>
            <Text numberOfLines={1} style={[styles.titulo, { color: colors.text }]}>
              {v.libro.titulo}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.sub, { color: aviso?.tono === 'error' ? colors.danger : colors.textSecondary }]}
              accessibilityLiveRegion="polite"
            >
              {subtitulo} · {textoVelocidad(v.velocidad)}
            </Text>
          </View>
        </Pressable>
        <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={motor.atras15} />
        <Pressable
          onPress={() => motor.alternar()}
          accessibilityRole="button"
          accessibilityLabel={etiquetaPlay}
          testID="mini-alternar"
          style={({ pressed }) => [
            styles.play,
            { backgroundColor: SALA_ESCUCHA.laton },
            web({
              backgroundImage:
                'radial-gradient(circle at 34% 26%, rgba(255,246,214,0.9) 0%, rgba(255,246,214,0) 36%), linear-gradient(160deg, #F0C982 0%, #D9A35B 30%, #C9A227 62%, #8C6D12 100%)',
              transition: 'transform 140ms ease',
              boxShadow: '0 3px 8px rgba(0,0,0,0.45), inset 0 -2px 4px rgba(0,0,0,0.25)',
              cursor: 'pointer',
            }),
            pressed && { transform: [{ scale: 0.92 }] },
          ]}
        >
          {ocupado ? (
            <ActivityIndicator color={SALA_ESCUCHA.robleOscuro} />
          ) : (
            <Icono
              nombre={sonando ? 'pause' : enError ? 'volver' : 'play'}
              color={SALA_ESCUCHA.robleOscuro}
              relleno={!enError}
              tamano={22}
            />
          )}
        </Pressable>
        <BotonIcono icono="adelante15" etiqueta="Adelantar 15 segundos" onPress={motor.adelante15} />
        <BotonIcono
          icono="close"
          etiqueta="Cerrar el reproductor (deja de sonar)"
          onPress={() => motor.detener()}
          testID="mini-cerrar"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: { borderTopWidth: 1, minHeight: ALTO_MINI },
  avance: { height: 3 },
  hilo: { height: '100%' },
  fila: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  filaAncha: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  textos: { flex: 1 },
  onda: { width: 24, alignItems: 'center' },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  sub: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums'] },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
})

export default MiniReproductor
