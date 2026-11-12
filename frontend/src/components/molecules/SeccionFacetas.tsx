import React from 'react'

import { StyleSheet, View } from 'react-native'

import Chip from '@componentes/atoms/Chip'
import AppText from '@componentes/atoms/Text'

interface Props {
  titulo: string
  valores: string[]
  activos: string[]
  onAlternar: (v: string) => void
}

/*
 * Una sección de facetas de una hoja de filtros (Autor, Género, Formato…):
 * su rótulo y sus chips, cada uno se marca o se desmarca. La usan el catálogo
 * y la estantería; sin valores no se pinta.
 */
const SeccionFacetas: React.FC<Props> = ({ titulo, valores, activos, onAlternar }) =>
  valores.length ? (
    <View style={styles.seccion}>
      <AppText variant="label">{titulo}</AppText>
      <View style={styles.chips}>
        {valores.map((v) => (
          <Chip key={v} etiqueta={v} activo={activos.includes(v)} onPress={() => onAlternar(v)} />
        ))}
      </View>
    </View>
  ) : null

const styles = StyleSheet.create({
  seccion: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
})

export default SeccionFacetas
