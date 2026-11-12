import React from 'react'

import { StyleSheet, Text, View } from 'react-native'

import { tipoDeArchivo } from '@logica/carpetas'
import { fontSize, fuentes, paleta } from '@tema'
import { web } from '@tema/web'
import type { Formato } from '@tipos'

interface Props {
  formato: Formato | string | null | undefined
}

/*
 * El icono de un archivo: una hoja de papel con la esquina doblada y, abajo,
 * una etiqueta de color con el formato (XLSX, MD, PDF…). El color dice la
 * familia (hoja de cálculo, texto, presentación…) pero nunca solo el color:
 * la etiqueta lleva siempre las letras. Decorativo para el lector de pantalla:
 * la tarjeta ya dice "hoja de cálculo XLSX".
 */
const IconoArchivo: React.FC<Props> = ({ formato }) => {
  const t = tipoDeArchivo(formato)
  return (
    <View style={styles.papel} accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden>
      <View
        style={[styles.esquina, web({ backgroundImage: 'linear-gradient(225deg, transparent 50%, #D8C9A6 50%)' })]}
      />
      <View style={styles.renglones}>
        <View style={[styles.renglon, { width: '70%' }]} />
        <View style={[styles.renglon, { width: '85%' }]} />
      </View>
      <View style={[styles.etiqueta, { backgroundColor: t.color }]}>
        <Text style={styles.texto} numberOfLines={1}>
          {t.etiqueta}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  papel: {
    width: 46,
    height: 56,
    borderRadius: 4,
    backgroundColor: paleta.marfil,
    borderWidth: 1,
    borderColor: '#CDBB94',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  esquina: { position: 'absolute', top: 0, right: 0, width: 13, height: 13, backgroundColor: '#E7DBBF' },
  renglones: { position: 'absolute', top: 14, left: 7, right: 9, gap: 5 },
  renglon: { height: 2, borderRadius: 1, backgroundColor: '#CDBB94' },
  etiqueta: { paddingVertical: 2, alignItems: 'center' },
  texto: { fontFamily: fuentes.uiNegrita, fontSize: fontSize.xs, color: paleta.marfil, letterSpacing: 0.2 },
})

export default IconoArchivo
