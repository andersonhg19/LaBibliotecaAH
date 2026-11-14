import React from 'react'

import { StyleSheet, Text, View } from 'react-native'

import { fontSize, fuentes } from '@tema'
import { LATON_PLANO, TINTA_LATON } from '@tema/materiales'
import { web } from '@tema/web'

interface Props {
  titulo: string
  /** Lo que va a la derecha del nombre, más pequeño ("24 de 40"). */
  detalle?: string
  accessibilityLabel?: string
  testID?: string
}

/** Un tornillo de cabeza ranurada, como los de las placas de verdad. */
const Tornillo: React.FC = () => (
  <View
    accessible={false}
    style={[
      styles.tornillo,
      web({
        backgroundImage:
          'linear-gradient(45deg, rgba(0,0,0,0) 44%, rgba(60,40,10,0.75) 45%, rgba(60,40,10,0.75) 55%, rgba(0,0,0,0) 56%), radial-gradient(circle at 35% 30%, #FFF2C4, #C9A227 55%, #7A5A14)',
        boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.35), 0 1px 0 rgba(255,240,200,0.4)',
      }),
    ]}
  />
)

/*
 * LA PLACA DE LATÓN de cada estante (plan de diseño A): latón cepillado con dos
 * tornillos y el nombre grabado en tinta casi negra. El texto se lee igual de
 * noche y de día porque la placa trae su propio fondo (8,8:1 sobre el latón).
 */
const Placa: React.FC<Props> = ({ titulo, detalle, accessibilityLabel, testID }) => (
  <View
    testID={testID}
    accessible
    accessibilityRole="header"
    {...({ role: 'heading', 'aria-level': 2 } as object)}
    accessibilityLabel={accessibilityLabel ?? (detalle ? `${titulo}, ${detalle}` : titulo)}
    style={[
      styles.placa,
      { backgroundColor: LATON_PLANO },
      web({
        backgroundImage: 'linear-gradient(180deg, #F3DC97 0%, #DFC067 45%, #CDA73C 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,250,225,0.8), inset 0 -1px 0 rgba(90,60,10,0.45), 0 2px 4px rgba(20,10,4,0.45), 0 0 0 1px rgba(90,60,10,0.55)',
      }),
    ]}
  >
    <Tornillo />
    <Text style={[styles.titulo, web({ textShadow: '0 1px 0 rgba(255,245,210,0.65)' })]} numberOfLines={1}>
      {titulo}
    </Text>
    {detalle ? (
      <Text style={[styles.detalle, styles.cifras]} numberOfLines={1}>
        {detalle}
      </Text>
    ) : null}
    <Tornillo />
  </View>
)

const styles = StyleSheet.create({
  placa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
    minHeight: 34,
  },
  tornillo: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#B8902C' },
  titulo: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.lg,
    letterSpacing: 0.8,
    color: TINTA_LATON,
    flexShrink: 1,
  },
  /* La cuenta nunca se parte en dos líneas («1 / libro»): si falta sitio, encoge el nombre. */
  detalle: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, color: TINTA_LATON, flexShrink: 0 },
  cifras: { fontVariant: ['lining-nums', 'tabular-nums'] },
})

export default Placa
