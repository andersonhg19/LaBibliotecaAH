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
  /** Tumbado en la balda (en pila): el lomo en horizontal y el título se lee de izquierda a derecha. */
  tumbado?: boolean
}

/*
 * EL LOMO: cuero con luz de cilindro (brillo a los lados, nunca debajo del
 * título), bandas doradas arriba y abajo, y el título en vertical en dorado,
 * de arriba abajo como en los libros en español. El grosor dice cuánto dura;
 * el color es suyo siempre. Tumbado, el mismo libro acostado.
 */
const Lomo: React.FC<Props> = ({ libro, escala = 1, colorFijo, tumbado }) => {
  const { alto, grosor } = dimensionesLomo(libro, escala)
  const base = colorLomo(libro, colorFijo)
  const oro = doradoLomo(libro)
  const bandas = bandasLomo(libro)
  const grosorReal = grosor / escala
  const tam = Math.round(Math.max(15, Math.min(19, grosorReal * 0.36)) * escala)
  const apellido = libro.autores?.[0]?.split(' ').slice(-1)[0] ?? ''
  const conAutor = !!apellido && grosorReal >= 46
  const sombraTexto = web({ textShadow: '0 1px 0 rgba(0,0,0,0.75)' })

  if (tumbado) {
    return (
      <View
        accessible={false}
        style={[
          styles.tumbado,
          { width: alto, height: grosor, backgroundColor: base },
          web({ backgroundImage: texturaLomo(base, true) }),
        ]}
      >
        <View style={styles.bandasV}>
          {Array.from({ length: bandas }).map((_, i) => (
            <View key={i} style={[styles.bandaV, { backgroundColor: oro }]} />
          ))}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.titulo, styles.tituloTumbado, { color: oro, fontSize: tam }, sombraTexto]}
        >
          {libro.titulo}
        </Text>
        <View style={[styles.bandaV, { backgroundColor: oro }]} />
      </View>
    )
  }

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
            { color: oro, fontSize: tam, maxHeight: alto - (conAutor ? 96 : 56) * escala },
            web({
              writingMode: 'vertical-rl',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }),
            sombraTexto,
          ]}
        >
          {libro.titulo}
        </Text>
      </View>
      <View style={styles.pie}>
        {conAutor ? (
          <Text
            numberOfLines={1}
            style={[
              styles.autor,
              { color: oro, fontSize: Math.round(14 * escala) },
              web({ writingMode: 'vertical-rl', maxHeight: 44 * escala, overflow: 'hidden' }),
              sombraTexto,
            ]}
          >
            {apellido}
          </Text>
        ) : null}
        <View style={[styles.banda, { backgroundColor: oro }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  lomo: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tumbado: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  bandas: { gap: 3, alignSelf: 'stretch', paddingHorizontal: 3 },
  bandasV: { flexDirection: 'row', gap: 3, alignSelf: 'stretch', paddingVertical: 3 },
  banda: { height: 1.5, alignSelf: 'stretch', opacity: 0.85 },
  bandaV: { width: 1.5, alignSelf: 'stretch', opacity: 0.85 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingVertical: 6 },
  titulo: { fontFamily: fuentes.tituloNegrita, letterSpacing: 0.6 },
  tituloTumbado: { flex: 1, textAlign: 'center' },
  pie: { alignItems: 'center', gap: 4, alignSelf: 'stretch', paddingHorizontal: 3 },
  autor: { fontFamily: fuentes.tituloCursiva, opacity: 0.9 },
})

export default Lomo
