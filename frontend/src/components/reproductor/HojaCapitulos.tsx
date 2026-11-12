import React, { useRef } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { numerarCapitulos } from '@logica/capitulos'
import { duracion } from '@logica/formato'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { CapituloResumen } from '@tipos'
import { estadoElegible } from '@utils/aria'

/*
 * LOS CAPÍTULOS, A MANO PERO NO A LA VISTA: cerrados en una pastilla
 * («Capítulo 3 de 12 ▾») y abiertos en esta hoja solo cuando se quieren.
 * El actual va marcado y se ve al abrir; tocar uno lo pone a sonar y la hoja
 * se cierra sola.
 */

/**
 * «Capítulo 3 de 12», numerado como en la ficha del libro: la portadilla y las
 * páginas preliminares no cuentan (así coincide con el «Capítulo 3» del título).
 * En una preliminar: «Inicio · 12 capítulos».
 */
export function textoPosicion(capitulos: readonly CapituloResumen[], actual: number, tituloLibro = ''): string {
  const numeros = numerarCapitulos([...capitulos], tituloLibro)
  const total = Math.max(1, ...numeros.map((n) => n ?? 0))
  const i = capitulos.findIndex((c) => c.indice === actual)
  const n = i >= 0 ? numeros[i] : numeros.find((x) => x != null)
  return n == null ? `Inicio · ${total} capítulo${total === 1 ? '' : 's'}` : `Capítulo ${n} de ${total}`
}

const HojaCapitulos: React.FC<{
  visible: boolean
  capitulos: CapituloResumen[]
  actual: number
  /** Para no numerar la portadilla (como la ficha del libro). */
  tituloLibro?: string
  onElegir: (indice: number) => void
  onCerrar: () => void
}> = ({ visible, capitulos, actual, tituloLibro = '', onElegir, onCerrar }) => {
  const { colors } = useTheme()
  const scroll = useRef<ScrollView>(null)
  const numeros = numerarCapitulos(capitulos, tituloLibro)
  return (
    <Hoja visible={visible} titulo="Capítulos" onCerrar={onCerrar} testID="hoja-capitulos" refScroll={scroll}>
      <View>
        {capitulos.map((c, i) => {
          const esActual = c.indice === actual
          return (
            <Pressable
              key={c.indice}
              testID={`capitulo-fila-${c.indice}`}
              onPress={() => {
                onElegir(c.indice)
                onCerrar()
              }}
              onLayout={
                esActual
                  ? (e) => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 96), animated: false })
                  : undefined
              }
              {...estadoElegible('radio', esActual)}
              accessibilityLabel={`${c.titulo}${esActual ? ', suena ahora' : ''}${c.minutos ? `, ${duracion(c.minutos)}` : ''}`}
              style={({ pressed }) => [
                styles.fila,
                { borderBottomColor: colors.border },
                esActual && { backgroundColor: 'rgba(201,162,39,0.14)' },
                pressed && { opacity: 0.7 },
                web({ cursor: 'pointer' }),
              ]}
            >
              <View style={styles.marca} accessible={false}>
                {esActual ? (
                  <Icono nombre="voz" color={SALA_ESCUCHA.laton} tamano={18} />
                ) : (
                  <Text style={[styles.numero, { color: colors.textMuted }]}>
                    {numeros[i] == null ? '·' : String(numeros[i]).padStart(2, '0')}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.titulo, { color: esActual ? colors.primary : colors.text }]}
                numberOfLines={2}
                accessible={false}
              >
                {c.titulo}
              </Text>
              <Text style={[styles.minutos, { color: colors.textMuted }]} accessible={false}>
                {duracion(c.minutos)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Hoja>
  )
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  marca: { width: 28, alignItems: 'center' },
  numero: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  titulo: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  minutos: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums'] },
})

export default HojaCapitulos
