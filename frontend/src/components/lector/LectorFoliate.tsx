import React, { forwardRef, useEffect, useImperativeHandle } from 'react'

import { StyleSheet, View } from 'react-native'

import { ControlLector, PropsLector } from '@componentes/lector/tipos'
import EmptyState from '@componentes/molecules/EmptyState'

/*
 * Versión NO web: el lector (foliate-js) es DOM y vive en LectorFoliate.web.tsx.
 * Esta solo existe para que las pruebas (que corren como nativo) puedan pintar
 * la pantalla del lector y comprobar sus controles.
 */
const LectorFoliate = forwardRef<ControlLector, PropsLector>(({ onListo }, ref) => {
  useImperativeHandle(ref, () => ({
    irA: async () => {},
    siguiente: () => {},
    anterior: () => {},
    buscar: async () => [],
    limpiarBusqueda: () => {},
    volverAtras: () => {},
    pintarAnotacion: () => {},
    borrarAnotacion: () => {},
    actualizarAnotacion: () => {},
    limpiarSeleccion: () => {},
    seguirVoz: () => {},
  }))
  useEffect(() => {
    onListo({ indice: [], secciones: [] })
  }, [onListo])
  return (
    <View style={styles.flex} testID="lector-nativo">
      <EmptyState
        title="El lector se abre en el navegador"
        message="La Biblioteca AH es una web: abre este libro en Safari, Chrome o el PC."
        icon="libroAbierto"
      />
    </View>
  )
})

LectorFoliate.displayName = 'LectorFoliate'

const styles = StyleSheet.create({ flex: { flex: 1 } })

export default LectorFoliate
