import React from 'react'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Encabezado from '@componentes/molecules/Encabezado'
import Sala from '@componentes/molecules/Sala'
import type { Rutas } from '@navegacion/linking'
import FichaLibro from '@pantallas/libro/FichaLibro'

type Props = NativeStackScreenProps<Rutas, 'Libro'>

/** /libro/:id — la ficha a pantalla completa (en el teléfono, o entrando por la URL). */
const LibroScreen: React.FC<Props> = ({ route }) => (
  <Sala>
    <Encabezado titulo="Ficha del libro" atras />
    <FichaLibro key={route.params.id} ejemplarId={route.params.id} />
  </Sala>
)

export default LibroScreen
