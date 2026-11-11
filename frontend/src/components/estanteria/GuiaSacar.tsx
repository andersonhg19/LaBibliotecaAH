import React from 'react'

import { StyleSheet, Text, View } from 'react-native'

import Svg, { Path } from 'react-native-svg'

import Button from '@componentes/atoms/Button'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { lomo as texturaLomo } from '@tema/madera'
import { panel } from '@tema/materiales'
import { web } from '@tema/web'

/*
 * LA PRIMERA VEZ (plan de diseño C/D): en lugar de una frase fija encima de la
 * estantería para siempre, una tarjeta que lo ENSEÑA: un lomo y una mano
 * fantasma que lo sostiene y lo sube. Se cierra con "Entendido" y no vuelve
 * (se recuerda en el dispositivo). Con "Reducir movimiento" la mano no se
 * mueve; el texto lo explica igual.
 */
const Mano: React.FC = () => (
  <Svg width={34} height={40} viewBox="0 0 34 40" pointerEvents="none">
    <Path
      d="M12 4c0-2 3-2 3 0v14l1-6c0-2 3-2 3 0v6l1-4c0-2 3-2 3 0v5l1-2c.5-2 3-1.5 3 .5V28c0 6-4 10-10 10h-1c-4 0-7-2-9-6l-5-9c-1-2 1-3.5 2.5-2L12 25z"
      fill="rgba(251,247,238,0.92)"
      stroke={paleta.nogal}
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  </Svg>
)

const GuiaSacar: React.FC<{ onEntendido: () => void; compacta?: boolean }> = ({ onEntendido, compacta }) => {
  const { colors, isDark } = useTheme()
  /* En el teléfono, UNA línea: no empuja la estantería fuera de la primera pantalla. */
  if (compacta) {
    return (
      <View
        testID="guia-sacar"
        style={[
          styles.compacta,
          { backgroundColor: colors.card, borderColor: colors.primaryLight },
          web(panel(isDark, colors)),
        ]}
      >
        <View style={styles.demoCorta} accessible={false}>
          <View style={[styles.lomoCorto, web({ backgroundImage: texturaLomo(paleta.burdeos) })]} />
          <View
            style={[
              styles.manoCorta,
              web({ animationName: 'bah-mano-corta', animationDuration: '2.4s', animationIterationCount: 'infinite' }),
            ]}
          >
            <Mano />
          </View>
        </View>
        <Text style={[styles.lineaCorta, { color: colors.text }]} numberOfLines={2}>
          Mantén pulsado un libro y súbelo para sacarlo.
        </Text>
        <Button title="Entendido" size="small" onPress={onEntendido} testID="guia-entendido" />
      </View>
    )
  }
  return (
    <View
      testID="guia-sacar"
      style={[
        styles.tarjeta,
        { backgroundColor: colors.card, borderColor: colors.primaryLight },
        web(panel(isDark, colors)),
      ]}
    >
      <View style={styles.demo} accessible={false}>
        <View style={[styles.lomo, web({ backgroundImage: texturaLomo(paleta.burdeos) })]} />
        <View
          style={[
            styles.mano,
            web({ animationName: 'bah-mano', animationDuration: '2.6s', animationIterationCount: 'infinite' }),
          ]}
        >
          <Mano />
        </View>
      </View>
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color: colors.text }]}>Saca un libro del estante</Text>
        <Text style={[styles.texto, { color: colors.textSecondary }]}>
          Toca un libro para ver su ficha. Para sacarlo de verdad, mantén el dedo sobre el lomo y súbelo: gira, se abre
          y entras.
        </Text>
        <View style={styles.boton}>
          <Button title="Entendido" size="small" onPress={onEntendido} testID="guia-entendido" />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  compacta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 12,
    marginTop: 6,
  },
  demoCorta: { width: 30, height: 48, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  lomoCorto: { width: 12, height: 36, borderRadius: 2, backgroundColor: paleta.burdeos },
  manoCorta: { position: 'absolute', bottom: -14, left: 4, transform: [{ scale: 0.6 }] },
  lineaCorta: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, lineHeight: 18 },
  tarjeta: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 10,
    maxWidth: 640,
  },
  demo: { width: 56, height: 120, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  lomo: { width: 22, height: 74, borderRadius: 2, backgroundColor: paleta.burdeos },
  mano: { position: 'absolute', bottom: 2, left: 14 },
  textos: { flex: 1, gap: 6 },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg },
  texto: { fontFamily: fuentes.ui, fontSize: fontSize.xs, lineHeight: 20 },
  boton: { flexDirection: 'row' },
})

export default GuiaSacar
