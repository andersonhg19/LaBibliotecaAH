import React, { useEffect } from 'react'

import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import Deslizador from '@componentes/atoms/Deslizador'
import Icono from '@componentes/atoms/Icono'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { useTheme } from '@contextos/ThemeContext'
import { PASO_FINO, VELOCIDAD_MAX, VELOCIDAD_MIN, textoVelocidad } from '@logica/velocidad'
import { fontSize, fuentes } from '@tema'
import { reducirMovimiento, web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

/*
 * LOS CONTROLES DE LA VOZ, CON MATERIA: un botón de latón (degradado miel →
 * latón, bisel, brillo) que se hunde al pulsarlo y late suave mientras la voz
 * habla; una onda de tres barras junto al capítulo; y la velocidad como un
 * deslizador con muescas tocables (0.5x … 5x), en vez de trece botones.
 *
 * Componentes locales del reproductor (el botón común del sistema de diseño
 * aún no existe): anotados para el integrador.
 */

let estilosPuestos = false
/** Las animaciones (latido, onda) no se pueden poner en línea: se inyectan una vez. */
export function ponerEstilosVoz() {
  if (estilosPuestos || Platform.OS !== 'web' || typeof document === 'undefined') return
  estilosPuestos = true
  const s = document.createElement('style')
  s.textContent = `
  @keyframes bahLatido{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.35);opacity:0}}
  @keyframes bahOnda{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
  .bah-latido{animation:bahLatido 1.8s ease-out infinite}
  .bah-onda>span{display:inline-block;width:3px;height:14px;margin:0 1.5px;border-radius:2px;background:#C9A227;transform-origin:50% 100%;animation:bahOnda 1s ease-in-out infinite}
  .bah-onda>span:nth-child(2){animation-delay:.18s}.bah-onda>span:nth-child(3){animation-delay:.36s}
  @media (prefers-reduced-motion: reduce){.bah-latido,.bah-onda>span{animation:none}}
  `
  document.head.appendChild(s)
}

/** El botón grande de ▶/⏸ (también «Reintentar» en un fallo). */
export const BotonLaton: React.FC<{
  sonando: boolean
  ocupado: boolean
  enError: boolean
  onPress: () => void
  tamano?: number
  testID?: string
}> = ({ sonando, ocupado, enError, onPress, tamano = 76, testID }) => {
  useEffect(() => ponerEstilosVoz(), [])
  const etiqueta = sonando ? 'Pausar' : enError ? 'Reintentar' : 'Reproducir'
  return (
    <View style={[styles.marco, { width: tamano + 16, height: tamano + 16 }]}>
      {sonando && Platform.OS === 'web' && !reducirMovimiento()
        ? React.createElement('div', {
            className: 'bah-latido',
            'aria-hidden': true,
            style: {
              position: 'absolute',
              width: tamano,
              height: tamano,
              borderRadius: tamano / 2,
              border: `3px solid ${SALA_ESCUCHA.miel}`,
              pointerEvents: 'none',
            },
          })
        : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        testID={testID}
        style={({ pressed }) => [
          styles.boton,
          {
            width: tamano,
            height: tamano,
            borderRadius: tamano / 2,
            backgroundColor: SALA_ESCUCHA.laton,
            borderColor: SALA_ESCUCHA.latonOscuro,
          },
          web({
            backgroundImage:
              'radial-gradient(circle at 34% 26%, rgba(255,246,214,0.95) 0%, rgba(255,246,214,0) 34%), linear-gradient(160deg, #F0C982 0%, #D9A35B 30%, #C9A227 62%, #8C6D12 100%)',
            boxShadow: pressed
              ? '0 3px 8px rgba(0,0,0,0.45), inset 0 3px 8px rgba(0,0,0,0.35)'
              : '0 12px 26px rgba(0,0,0,0.5), inset 0 -4px 7px rgba(0,0,0,0.28), inset 0 2px 3px rgba(255,255,255,0.55)',
            transition: 'transform 140ms ease, box-shadow 140ms ease',
            cursor: 'pointer',
          }),
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        {ocupado ? (
          <ActivityIndicator color={SALA_ESCUCHA.robleOscuro} />
        ) : (
          <Icono
            nombre={sonando ? 'pause' : enError ? 'volver' : 'play'}
            color={SALA_ESCUCHA.robleOscuro}
            tamano={Math.round(tamano * 0.45)}
            relleno={!enError}
          />
        )}
      </Pressable>
    </View>
  )
}

/** Tres barras de latón que se mueven mientras la voz habla. */
export const OndaVoz: React.FC<{ activa: boolean }> = ({ activa }) => {
  useEffect(() => ponerEstilosVoz(), [])
  if (!activa || Platform.OS !== 'web') return null
  return React.createElement(
    'span',
    {
      className: 'bah-onda',
      'aria-hidden': true,
      style: { display: 'inline-flex', alignItems: 'flex-end', height: 14 },
    },
    React.createElement('span'),
    React.createElement('span'),
    React.createElement('span'),
  )
}

const MUESCAS = [0.5, 1, 1.5, 2, 3, 4, 5]

/** La velocidad: deslizador fino con muescas tocables debajo. */
export const SelectorVelocidad: React.FC<{ valor: number; onCambio: (v: number) => void }> = ({ valor, onCambio }) => {
  const { colors } = useTheme()
  return (
    <View style={styles.velocidad}>
      <View style={styles.velocidadCabeza}>
        <Text style={[styles.velocidadValor, { color: SALA_ESCUCHA.laton }]}>{textoVelocidad(valor)}</Text>
      </View>
      <Deslizador
        valor={valor}
        min={VELOCIDAD_MIN}
        max={VELOCIDAD_MAX}
        paso={PASO_FINO}
        etiqueta="Velocidad"
        textoValor={textoVelocidad}
        onSoltar={onCambio}
        testID="deslizador-velocidad"
      />
      <View style={styles.muescas}>
        {MUESCAS.map((m) => {
          const activa = Math.abs(valor - m) < 0.001
          return (
            <Pressable
              key={m}
              onPress={() => onCambio(m)}
              {...estadoElegible('button', activa)}
              accessibilityLabel={textoVelocidad(m)}
              style={({ pressed }) => [
                styles.muesca,
                pressed && { transform: [{ scale: 0.92 }] },
                web({ transition: 'transform 120ms ease' }),
              ]}
            >
              <View style={[styles.palito, { backgroundColor: activa ? SALA_ESCUCHA.laton : colors.border }]} />
              <Text
                style={[
                  styles.muescaTexto,
                  { color: activa ? SALA_ESCUCHA.laton : colors.textSecondary },
                  activa && styles.muescaActiva,
                ]}
              >
                {textoVelocidad(m)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  marco: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  boton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, minHeight: 44 },
  velocidad: { gap: 2 },
  velocidadCabeza: { alignItems: 'center' },
  velocidadValor: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.xl, fontVariant: ['lining-nums'] },
  muescas: { flexDirection: 'row', justifyContent: 'space-between' },
  muesca: { minHeight: 44, minWidth: 40, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  palito: { width: 2, height: 8, borderRadius: 1, marginBottom: 4 },
  muescaTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums'] },
  muescaActiva: { fontFamily: fuentes.uiSemi },
})
