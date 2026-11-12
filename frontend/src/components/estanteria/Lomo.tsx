import React, { useMemo } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import {
  ESPACIADO_TITULO,
  HUECO_AUTOR,
  Medidor,
  TAM_AUTOR,
  bandasLomo,
  colorLomo,
  dimensionesLomo,
  doradoLomo,
  grosorUtil,
  largoUtil,
  medirEstimado,
  textoDelLomo,
} from '@logica/lomos'
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
 * MEDIR DE VERDAD EN LA WEB. Con canvas se mide el ancho real del texto en
 * Cormorant, así el corte por palabras es exacto. Solo si la fuente ya está
 * cargada (si no, el canvas mediría con otra letra y se guardaría mal); hasta
 * entonces, y en las pruebas, la estimación de lomos.ts.
 */
let lienzo: CanvasRenderingContext2D | null | undefined
const medidas = new Map<string, number>()
const medirWeb: Medidor = (texto, tam, estilo) => {
  if (typeof document === 'undefined') return medirEstimado(texto, tam, estilo)
  const familia = estilo === 'titulo' ? fuentes.tituloNegrita : fuentes.tituloCursiva
  const fuente = `${tam}px "${familia}"`
  const clave = `${fuente}|${texto}`
  const guardada = medidas.get(clave)
  if (guardada != null) return guardada
  try {
    if (!document.fonts?.check(fuente)) return medirEstimado(texto, tam, estilo)
    if (lienzo === undefined) lienzo = document.createElement('canvas').getContext('2d')
    if (!lienzo) return medirEstimado(texto, tam, estilo)
    lienzo.font = fuente
    /* +4 %: el navegador redondea distinto en el DOM; mejor que sobre un poco a que corte. */
    const ancho = lienzo.measureText(texto).width * 1.04 + (estilo === 'titulo' ? ESPACIADO_TITULO * texto.length : 0)
    medidas.set(clave, ancho)
    return ancho
  } catch {
    return medirEstimado(texto, tam, estilo)
  }
}

/*
 * EL LOMO: cuero con luz de cilindro (brillo a los lados, nunca debajo del
 * título), bandas doradas arriba y abajo, y el título en dorado, de arriba
 * abajo como en los libros en español. El grosor dice cuánto dura; el color es
 * suyo siempre. Tumbado, el mismo libro acostado.
 *
 * El texto lo compone `textoDelLomo` (tamaño, 1 o 2 líneas, corte por palabras,
 * autor solo si cabe entero) y aquí se pinta EN HORIZONTAL dentro de una caja
 * del largo útil del lomo que luego se gira 90°: así se ve igual en Chrome, en
 * Safari de iPhone y en nativo (antes, con writing-mode, Safari lo perdía).
 */
const Lomo: React.FC<Props> = ({ libro, escala = 1, colorFijo, tumbado }) => {
  const { alto, grosor } = dimensionesLomo(libro, escala)
  const base = colorLomo(libro, colorFijo)
  const oro = doradoLomo(libro)
  const bandas = bandasLomo(libro)
  const sinEscala = useMemo(() => dimensionesLomo(libro, 1), [libro])
  const texto = useMemo(() => textoDelLomo(libro, sinEscala, medirWeb), [libro, sinEscala])
  const sombraTexto = web({ textShadow: '0 1px 0 rgba(0,0,0,0.75)' })
  const largo = largoUtil(sinEscala.alto) * escala
  const ancho = grosorUtil(sinEscala.grosor) * escala

  const rotulo = (
    <View
      style={[styles.rotulo, { width: largo, height: ancho }, !tumbado && styles.girado]}
      testID={`lomo-rotulo-${libro.id}`}
    >
      <View style={styles.titulo}>
        {texto.lineas.map((l, i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={[
              styles.linea,
              {
                color: oro,
                fontSize: texto.tam * escala,
                lineHeight: texto.alturaLinea * escala,
                letterSpacing: ESPACIADO_TITULO * escala,
              },
              sombraTexto,
            ]}
          >
            {l}
          </Text>
        ))}
      </View>
      {texto.autor ? (
        <Text
          numberOfLines={1}
          style={[
            styles.autor,
            { color: oro, fontSize: TAM_AUTOR * escala, marginLeft: HUECO_AUTOR * escala },
            sombraTexto,
          ]}
        >
          {texto.autor}
        </Text>
      ) : null}
    </View>
  )

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
        <View style={styles.centroTumbado}>{rotulo}</View>
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
      {/* El rótulo, centrado en el lomo y girado: su caja es más ancha que el lomo y se desborda por igual a los dos lados. */}
      <View style={styles.centro} pointerEvents="none">
        {rotulo}
      </View>
      <View style={styles.flex} />
      <View style={[styles.banda, styles.bandaPie, { backgroundColor: oro }]} />
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
  },
  flex: { flex: 1 },
  bandas: { gap: 3, alignSelf: 'stretch', paddingHorizontal: 3 },
  bandasV: { flexDirection: 'row', gap: 3, alignSelf: 'stretch', paddingVertical: 3 },
  banda: { height: 1.5, alignSelf: 'stretch', opacity: 0.85 },
  bandaPie: { marginHorizontal: 3 },
  girado: { transform: [{ rotate: '90deg' }] },
  bandaV: { width: 1.5, alignSelf: 'stretch', opacity: 0.85 },
  centro: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centroTumbado: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rotulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titulo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  linea: { fontFamily: fuentes.tituloNegrita, textAlign: 'center' },
  autor: { fontFamily: fuentes.tituloCursiva, opacity: 0.9 },
})

export default Lomo
