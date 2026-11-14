import React, { useEffect, useRef, useState } from 'react'

import { ActivityIndicator, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

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
 * latón, bisel, brillo) que se hunde al pulsarlo; una onda de tres barras junto
 * al capítulo; y la velocidad como un deslizador con muescas tocables (0,5x …
 * 5x), en vez de trece botones.
 *
 * 0.4.0 (Ola E): mientras se prepara la voz, el ▶ lleva un ANILLO con el
 * progreso real (F6); mientras habla, un HALO y la onda siguen la energía de la
 * voz, leída de la envolvente precalculada del capítulo (F7, contrato C7: sin
 * Web Audio, que en iOS calla el audio en segundo plano). Sin envolvente, quietos.
 * Con «Reducir movimiento», todo quieto.
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
  .bah-latido{animation:bahLatido 1.8s ease-out infinite}
  .bah-onda>span{display:inline-block;width:3px;height:14px;margin:0 1.5px;border-radius:2px;background:#C9A227;transform-origin:50% 100%;transform:scaleY(.55);transition:transform 90ms linear}
  .bah-halo{transition:transform 90ms linear, opacity 90ms linear}
  @media (prefers-reduced-motion: reduce){.bah-latido{animation:none}.bah-onda>span,.bah-halo{transition:none}}
  `
  document.head.appendChild(s)
}

/**
 * Sigue la energía de la voz a 60 fps sin repintar React: llama a `aplicar`
 * con el nivel (0–1, o null sin envolvente) mientras `activo` y la página se ve.
 */
export function useNivel(
  nivel: (() => number | null) | undefined,
  activo: boolean,
  aplicar: (n: number | null) => void,
) {
  const aplicarRef = useRef(aplicar)
  aplicarRef.current = aplicar
  useEffect(() => {
    if (!activo || !nivel || Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
      aplicarRef.current(null)
      return
    }
    if (reducirMovimiento()) {
      aplicarRef.current(null)
      return
    }
    let id: number | null = null
    const paso = () => {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
      aplicarRef.current(visible ? nivel() : null)
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => {
      if (id != null) cancelAnimationFrame(id)
      aplicarRef.current(null)
    }
  }, [activo, nivel])
}

/** El botón grande de ▶/⏸ (también «Reintentar» en un fallo). */
export const BotonLaton: React.FC<{
  sonando: boolean
  ocupado: boolean
  enError: boolean
  onPress: () => void
  tamano?: number
  testID?: string
  /** F6: lo que lleva preparado (0–1) mientras se prepara o baja la voz; null si no se sabe. */
  progreso?: number | null
  /** F7: la energía de la voz ahora (envolvente); sin ella el halo se queda quieto. */
  nivel?: () => number | null
}> = ({ sonando, ocupado, enError, onPress, tamano = 76, testID, progreso = null, nivel }) => {
  useEffect(() => ponerEstilosVoz(), [])
  const halo = useRef<HTMLElement | null>(null)
  useNivel(nivel, sonando, (n) => {
    const h = halo.current
    if (!h) return
    h.style.transform = `scale(${n == null ? 1.08 : 1.04 + n * 0.3})`
    h.style.opacity = String(n == null ? 0.35 : 0.2 + n * 0.6)
  })
  const etiqueta = sonando ? 'Pausar' : enError ? 'Reintentar' : 'Reproducir'
  const conAnillo = ocupado && progreso != null
  const pct = conAnillo ? Math.round(Math.max(0, Math.min(1, progreso ?? 0)) * 100) : null
  const esWeb = Platform.OS === 'web'
  const anillo = tamano + 12
  return (
    <View style={[styles.marco, { width: tamano + 16, height: tamano + 16 }]}>
      {esWeb && sonando
        ? React.createElement('div', {
            className: 'bah-halo',
            'aria-hidden': true,
            ref: (n: HTMLElement | null) => {
              halo.current = n
            },
            style: {
              position: 'absolute',
              width: tamano,
              height: tamano,
              borderRadius: tamano / 2,
              border: `3px solid ${SALA_ESCUCHA.miel}`,
              boxShadow: `0 0 18px ${SALA_ESCUCHA.miel}`,
              opacity: 0.35,
              transform: 'scale(1.08)',
              pointerEvents: 'none',
            },
          })
        : null}
      {esWeb && ocupado && !conAnillo && !reducirMovimiento()
        ? // Sin progreso conocido, el ▶ «respira» (solo mientras se prepara: informa, no decora).
          React.createElement('div', {
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
      {esWeb && conAnillo
        ? React.createElement('div', {
            'aria-hidden': true,
            'data-testid': 'anillo-preparacion',
            style: {
              position: 'absolute',
              width: anillo,
              height: anillo,
              borderRadius: anillo / 2,
              backgroundImage: `conic-gradient(${SALA_ESCUCHA.miel} ${(pct ?? 0) * 3.6}deg, rgba(201,162,39,0.2) 0deg)`,
              transition: reducirMovimiento() ? undefined : 'background-image 300ms linear',
              pointerEvents: 'none',
            },
          })
        : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityValue={pct != null ? { min: 0, max: 100, now: pct, text: `Preparado al ${pct} %` } : undefined}
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
        {ocupado && !conAnillo ? (
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

/** Tres barras de latón que siguen la voz mientras habla (quietas sin envolvente o con «Reducir movimiento»). */
export const OndaVoz: React.FC<{ activa: boolean; nivel?: () => number | null }> = ({ activa, nivel }) => {
  useEffect(() => ponerEstilosVoz(), [])
  const caja = useRef<HTMLElement | null>(null)
  useNivel(nivel, activa, (n) => {
    const barras = caja.current?.children
    if (!barras) return
    // Cada barra con su propio peso, para que no suban las tres a la vez.
    const pesos = [0.75, 1, 0.6]
    for (let i = 0; i < barras.length; i++) {
      const b = barras[i] as HTMLElement
      b.style.transform = `scaleY(${n == null ? 0.55 : Math.max(0.2, Math.min(1, 0.2 + n * pesos[i % 3]))})`
    }
  })
  if (!activa || Platform.OS !== 'web') return null
  return React.createElement(
    'span',
    {
      className: 'bah-onda',
      'aria-hidden': true,
      ref: (n: HTMLElement | null) => {
        caja.current = n
      },
      style: { display: 'inline-flex', alignItems: 'flex-end', height: 14 },
    },
    React.createElement('span'),
    React.createElement('span'),
    React.createElement('span'),
  )
}

const MUESCAS = [0.5, 1, 1.5, 2, 3, 4, 5]
/** Si no caben siete muescas de 44 px, primero se quita 4x y luego 1,5x (el deslizador sigue llegando a todas). */
const MUESCAS_SOBRAN = [4, 1.5]
const MUESCA_MIN = 44

/** Las muescas que caben en `ancho` con un objetivo táctil de 44 px cada una (E10). */
export function muescasQueCaben(ancho: number): number[] {
  let m = [...MUESCAS]
  for (const quitar of MUESCAS_SOBRAN) {
    if (!ancho || m.length * MUESCA_MIN <= ancho) break
    m = m.filter((x) => x !== quitar)
  }
  return m
}

/** La velocidad: deslizador fino con muescas tocables debajo. */
export const SelectorVelocidad: React.FC<{ valor: number; onCambio: (v: number) => void }> = ({ valor, onCambio }) => {
  const { colors, isDark } = useTheme()
  const [ancho, setAncho] = useState(0)
  // De día el latón como texto no llega a 4,5:1 sobre papel (UX5-03): latón oscuro; el latón queda para trazos.
  const tinta = isDark ? SALA_ESCUCHA.laton : '#7A5A10'
  const muescas = muescasQueCaben(ancho)
  return (
    <View style={styles.velocidad}>
      <View style={styles.velocidadCabeza}>
        <Text style={[styles.velocidadValor, { color: tinta }]}>{textoVelocidad(valor)}</Text>
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
      <View style={styles.muescas} onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}>
        {muescas.map((m) => {
          const activa = Math.abs(valor - m) < 0.001
          return (
            <Pressable
              key={m}
              onPress={() => onCambio(m)}
              {...estadoElegible('button', activa)}
              accessibilityLabel={textoVelocidad(m)}
              testID={`muesca-${m}`}
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
                  { color: activa ? tinta : colors.textSecondary },
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
  muesca: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  palito: { width: 2, height: 8, borderRadius: 1, marginBottom: 4 },
  muescaTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums'] },
  muescaActiva: { fontFamily: fuentes.uiSemi },
})
