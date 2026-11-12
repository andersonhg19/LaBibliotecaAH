import React from 'react'

import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { BarraSeleccion, ControlesHoja } from '@componentes/hoja/ControlesHoja'
import { anchosDe, celdaEn, letraColumna } from '@componentes/hoja/rejilla'
import type { LibroDeHojas } from '@componentes/hoja/tipos'
import { useVisorHoja } from '@componentes/hoja/useVisorHoja'
import { fontSize, fuentes, paleta } from '@tema'

export interface PropsVisorHoja {
  libro: LibroDeHojas
}

/** Lo que se pinta fuera de la web (y en las pruebas): una tabla sencilla con las primeras filas. */
const FILAS_RESPALDO = 100
const COLUMNAS_RESPALDO = 26

const VisorHoja: React.FC<PropsVisorHoja> = ({ libro }) => {
  const v = useVisorHoja(libro)
  const anchos = anchosDe(v.hoja, v.anchosAjustados)
  const filas = Math.min(v.hoja.filas, FILAS_RESPALDO)
  const columnas = Math.min(v.hoja.columnas, COLUMNAS_RESPALDO)
  return (
    <View style={styles.visor} testID="visor-hoja">
      <ControlesHoja libro={libro} v={v} />
      <ScrollView horizontal style={styles.papel}>
        <ScrollView>
          <View role="grid" accessibilityLabel={`Celdas de la hoja ${v.hoja.nombre}`}>
            <View style={styles.fila}>
              <View style={[styles.celda, styles.numero]} />
              {Array.from({ length: columnas }, (_, c) => (
                <Text key={c} style={[styles.celda, styles.cabecera, { width: anchos[c] * v.zoom }]}>
                  {letraColumna(c)}
                </Text>
              ))}
            </View>
            {Array.from({ length: filas }, (_, f) => (
              <View key={f} style={styles.fila}>
                <Text style={[styles.celda, styles.numero, styles.cabecera]}>{f + 1}</Text>
                {Array.from({ length: columnas }, (_, c) => (
                  <Text key={c} numberOfLines={1} style={[styles.celda, { width: anchos[c] * v.zoom }]}>
                    {celdaEn(v.indice, f, c)?.[2] ?? ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
      <BarraSeleccion texto={v.textoSeleccion} />
    </View>
  )
}

const styles = StyleSheet.create({
  visor: { flex: 1 },
  papel: { flex: 1, backgroundColor: paleta.marfil },
  fila: { flexDirection: 'row' },
  celda: {
    height: 24,
    paddingHorizontal: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#D8CDB4',
    color: paleta.robleOscuro,
    fontFamily: fuentes.ui,
    fontSize: fontSize.xs,
  },
  numero: { width: 44, textAlign: 'right' },
  cabecera: { backgroundColor: '#F1EADB', color: '#6B5644' },
})

export default VisorHoja
