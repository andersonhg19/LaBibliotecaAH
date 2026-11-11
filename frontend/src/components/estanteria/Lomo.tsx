import React from 'react'

import { StyleSheet, Text, View } from 'react-native'

import { bandasLomo, colorLomo, dimensionesLomo, doradoLomo } from '@logica/lomos'
import { fuentes } from '@tema'
import { lomo as texturaLomo } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  libro: EjemplarDTO
  escala?: number
  colorFijo?: string | null
}

/*
 * EL LOMO: cuero con luz de cilindro (más claro en el centro), bandas doradas
 * arriba y abajo, y el título en vertical en dorado, de arriba abajo como en
 * los libros en español. El grosor dice cuánto dura; el color es suyo siempre.
 */
const Lomo: React.FC<Props> = ({ libro, escala = 1, colorFijo }) => {
  const { alto, grosor } = dimensionesLomo(libro, escala)
  const base = colorLomo(libro, colorFijo)
  const oro = doradoLomo(libro)
  const bandas = bandasLomo(libro)
  const tam = Math.max(14, Math.min(17, Math.round(grosor * 0.42)))
  const autor = libro.autores?.[0]?.split(' ').slice(-1)[0] ?? ''
  return (
    <View
      accessible={false}
      style={[
        styles.lomo,
        { width: grosor, height: alto, backgroundColor: base },
        web({ backgroundImage: texturaLomo(base) }),
        libro.tipo === 'DESEO' && { opacity: 0.55 },
      ]}
    >
      <View style={styles.bandas}>
        {Array.from({ length: bandas }).map((_, i) => (
          <View key={i} style={[styles.banda, { backgroundColor: oro }]} />
        ))}
      </View>
      <View style={styles.centro}>
        <Text
          numberOfLines={1}
          style={[
            styles.titulo,
            { color: oro, fontSize: tam, maxHeight: alto - 64 },
            web({
              writingMode: 'vertical-rl',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textShadow: '0 1px 0 rgba(0,0,0,0.7)',
            }),
          ]}
        >
          {libro.titulo}
        </Text>
      </View>
      <View style={styles.pie}>
        {autor && grosor >= 30 ? (
          <Text
            numberOfLines={1}
            style={[styles.autor, { color: oro }, web({ writingMode: 'vertical-rl', maxHeight: 40 })]}
          >
            {autor}
          </Text>
        ) : null}
        <View style={[styles.banda, { backgroundColor: oro }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  lomo: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 8,
  },
  bandas: { gap: 3, alignSelf: 'stretch', paddingHorizontal: 3 },
  banda: { height: 1.5, alignSelf: 'stretch', opacity: 0.85 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingVertical: 6 },
  titulo: { fontFamily: fuentes.tituloNegrita, letterSpacing: 0.6 },
  pie: { alignItems: 'center', gap: 4, alignSelf: 'stretch', paddingHorizontal: 3 },
  autor: { fontFamily: fuentes.tituloCursiva, fontSize: 14, opacity: 0.85 },
})

export default Lomo
