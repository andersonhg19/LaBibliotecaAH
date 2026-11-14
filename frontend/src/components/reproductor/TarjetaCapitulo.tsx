import React, { useEffect, useRef, useState } from 'react'

import { Animated, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { duracionHumana, restanteCapitulo } from '@componentes/reproductor/estadoVoz'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { reducirMovimiento, web } from '@tema/web'
import type { CapituloResumen } from '@tipos'
import { EstadoVoz, vecinoConVoz } from '@utils/motorAudio'

/*
 * EL PASO DE CAPÍTULO, A LA VISTA (Ola E, F4): en los últimos segundos del
 * capítulo, una tarjeta «Siguiente: «Tercero» · 9 min»; al cambiar, un aviso
 * breve «Ahora: «Tercero»». Aparecen y se van solas y no tapan nada que se
 * toque (no bloquean). Al acabar el libro, una tarjeta que se queda con
 * «Volver a empezar» (RP-02).
 */

/** Segundos reales antes del final en que se anuncia el siguiente. */
export const ANUNCIO_SEG = 20
/** Cuánto se ve el aviso «Ahora: …» tras cambiar de capítulo. */
export const AVISO_MS = 4_000

export const TEXTOS_TARJETA = {
  siguiente: (titulo: string, tiempo: string | null) => `Siguiente: «${titulo}»${tiempo ? ` · ${tiempo}` : ''}`,
  ahora: (titulo: string) => `Ahora: «${titulo}»`,
  finLibro: 'Has terminado el libro',
  volverAEmpezar: 'Volver a empezar',
}

type Datos = Pick<
  EstadoVoz,
  'capitulo' | 'posicion' | 'duracion' | 'velocidad' | 'fase' | 'temporizador' | 'finDelLibro'
>

/** Lo que dice la tarjeta ahora mismo (pura, para probarla sin pantalla). */
export function anuncioDeCapitulo(v: Datos, capitulos: readonly CapituloResumen[]): string | null {
  if (v.fase !== 'reproduciendo' || v.temporizador?.tipo === 'capitulo') return null
  const r = restanteCapitulo(v.posicion, v.duracion, v.velocidad)
  if (r == null || r > ANUNCIO_SEG) return null
  const sig = vecinoConVoz(capitulos, v.capitulo, 1)
  if (sig < 0) return null
  const c = capitulos.find((x) => x.indice === sig)
  if (!c) return null
  const min = c.minutosVoz ?? c.minutos
  return TEXTOS_TARJETA.siguiente(c.titulo, min > 0 ? duracionHumana((min * 60) / (v.velocidad || 1)) : null)
}

const Tarjeta: React.FC<{ visible: boolean; children: React.ReactNode; testID: string }> = ({
  visible,
  children,
  testID,
}) => {
  const { colors } = useTheme()
  const valor = useRef(new Animated.Value(visible ? 1 : 0)).current
  const [montada, setMontada] = useState(visible)
  useEffect(() => {
    if (visible) setMontada(true)
    if (reducirMovimiento()) {
      valor.setValue(visible ? 1 : 0)
      if (!visible) setMontada(false)
      return
    }
    const a = Animated.timing(valor, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: false })
    a.start(({ finished }) => {
      if (finished && !visible) setMontada(false)
    })
    return () => a.stop()
  }, [visible, valor])
  if (!montada) return null
  return (
    <Animated.View
      pointerEvents="box-none"
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[
        styles.tarjeta,
        {
          backgroundColor: colors.surface,
          borderColor: 'rgba(201,162,39,0.55)',
          opacity: valor,
          transform: [{ translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
        web({ boxShadow: '0 8px 22px rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }),
      ]}
    >
      {children}
    </Animated.View>
  )
}

const TarjetaCapitulo: React.FC<{
  v: Datos
  capitulos: readonly CapituloResumen[]
  onVolverAEmpezar: () => void
}> = ({ v, capitulos, onVolverAEmpezar }) => {
  const { colors } = useTheme()
  const anuncio = anuncioDeCapitulo(v, capitulos)
  /* El aviso «Ahora: …» al pasar de capítulo (solo si se pasa sonando, no al elegir uno parado). */
  const [ahora, setAhora] = useState<string | null>(null)
  const previo = useRef(v.capitulo)
  useEffect(() => {
    if (previo.current === v.capitulo) return
    previo.current = v.capitulo
    if (v.fase !== 'reproduciendo' && v.fase !== 'cargando') return
    const c = capitulos.find((x) => x.indice === v.capitulo)
    setAhora(TEXTOS_TARJETA.ahora(c?.titulo ?? `Capítulo ${v.capitulo + 1}`))
    const t = setTimeout(() => setAhora(null), AVISO_MS)
    return () => clearTimeout(t)
  }, [v.capitulo, v.fase, capitulos])

  const texto = v.finDelLibro ? null : (ahora ?? anuncio)
  return (
    <View style={styles.zona} pointerEvents="box-none">
      <Tarjeta visible={!!texto} testID="tarjeta-capitulo">
        <View style={styles.fila}>
          <Icono nombre="siguiente" color={SALA_ESCUCHA.laton} tamano={16} />
          <Text style={[styles.texto, { color: colors.text }]} numberOfLines={2}>
            {texto ?? ''}
          </Text>
        </View>
      </Tarjeta>
      <Tarjeta visible={v.finDelLibro} testID="tarjeta-fin-libro">
        <Text style={[styles.titulo, { color: colors.text }]}>{TEXTOS_TARJETA.finLibro}</Text>
        <Button
          title={TEXTOS_TARJETA.volverAEmpezar}
          icono="volver"
          size="small"
          variant="outline"
          onPress={onVolverAEmpezar}
          testID="volver-a-empezar"
        />
      </Tarjeta>
    </View>
  )
}

const styles = StyleSheet.create({
  zona: { alignItems: 'center', gap: 8 },
  tarjeta: {
    alignSelf: 'center',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  texto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm, flexShrink: 1, fontVariant: ['lining-nums'] },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, textAlign: 'center' },
})

export default TarjetaCapitulo
