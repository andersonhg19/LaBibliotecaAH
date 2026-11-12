import React, { useCallback, useEffect, useState } from 'react'

import { StyleSheet, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import VisorHoja from '@componentes/hoja/VisorHoja'
import { type LibroDeHojas, leerLibroDeHojas } from '@componentes/hoja/tipos'
import Encabezado from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { errorDeCarga, exigir, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import { esHojaDeCalculo } from '@logica/documentos'
import { seEstaPreparando } from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import { urlHoja } from '@servicios/archivos'
import { librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

type Props = NativeStackScreenProps<Rutas, 'Hoja'>

export const MENSAJES_HOJA = {
  noLista: 'Esta hoja todavía no está lista. Si la acabas de subir, espera un momento y vuelve a intentarlo.',
  sinDatos:
    'Los archivos de la biblioteca no están disponibles ahora mismo (disco desconectado). Inténtalo de nuevo en un rato.',
  fallo: 'No se pudo abrir la hoja de cálculo. Inténtalo otra vez.',
}

/** Descarga hoja.json y la valida; los fallos llegan como Error con un mensaje para la persona. */
export async function descargarHoja(archivoId: string): Promise<LibroDeHojas> {
  let r: Response
  try {
    r = await fetch(urlHoja(archivoId), { credentials: 'omit' })
  } catch (e) {
    console.warn('[hoja] sin conexión', e)
    throw errorDeCarga(MENSAJES.sinConexion)
  }
  if (r.status === 404) throw errorDeCarga(MENSAJES_HOJA.noLista)
  if (r.status === 503) throw errorDeCarga(MENSAJES_HOJA.sinDatos)
  if (!r.ok) throw errorDeCarga(MENSAJES_HOJA.fallo)
  let datos: unknown
  try {
    datos = await r.json()
  } catch (e) {
    console.warn('[hoja] hoja.json no es JSON', e)
    throw errorDeCarga(MENSAJES_HOJA.fallo)
  }
  const leido = leerLibroDeHojas(datos)
  if ('error' in leido) throw errorDeCarga(leido.error)
  return leido.libro
}

/*
 * LA HOJA DE CÁLCULO (v1.6): XLSX, XLS, ODS y CSV no se leen como un libro,
 * se miran en una rejilla. La ficha del documento (título, archivo, estado)
 * sale de /libros/get; la hoja, de hoja.json, que el taller deja ya leída.
 */
const HojaScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id } = route.params
  const { colors } = useTheme()
  const [doc, setDoc] = useState<EjemplarDTO | null>(null)
  const [hojas, setHojas] = useState<LibroDeHojas | null>(null)

  const tarea = useCallback(async () => {
    const d = exigir(await librosService.detalle(id)) ?? null
    setDoc(d)
    if (!d) throw errorDeCarga(MENSAJES.libroNoEncontrado)
    if (!d.archivoId || d.estadoConversion !== 'LISTO') return
    if (!esHojaDeCalculo(d.formatoOriginal)) return
    setHojas(await descargarHoja(d.archivoId))
  }, [id])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  /* Un documento que no es hoja se abre en el lector. */
  useEffect(() => {
    if (doc && doc.estadoConversion === 'LISTO' && !esHojaDeCalculo(doc.formatoOriginal)) {
      navigation.replace('Leer', { id: doc.id })
    }
  }, [doc, navigation])

  /* Si se está preparando, se pregunta cada poco y se carga sola al terminar. */
  usePreparacion(
    doc ? [doc] : [],
    useCallback(
      (l: EjemplarDTO) => {
        setDoc(l)
        if (l.estadoConversion === 'LISTO') cargar()
      },
      [cargar],
    ),
  )

  const titulo = doc?.titulo ?? 'Hoja de cálculo'
  let cuerpo: React.ReactNode
  if (error) cuerpo = <EstadoError mensaje={error} onReintentar={cargar} titulo="No se pudo abrir la hoja" />
  else if (doc && seEstaPreparando(doc))
    cuerpo = (
      <View style={styles.centro}>
        <Spinner />
        <AppText variant="body" align="center" color={colors.textSecondary}>
          Preparando la hoja de cálculo…
        </AppText>
      </View>
    )
  else if (doc && doc.estadoConversion === 'ERROR')
    cuerpo = <EstadoError mensaje={MENSAJES.conversionFallo} onReintentar={cargar} titulo="No se pudo preparar" />
  else if (doc && !cargando && !doc.archivoId)
    cuerpo = <EstadoError mensaje={MENSAJES.lectorSinArchivo} onReintentar={cargar} titulo="Sin archivo" />
  else if (cargando || !hojas) cuerpo = <Spinner fullScreen />
  else cuerpo = <VisorHoja libro={hojas} />

  return (
    <Sala>
      <Encabezado
        titulo={titulo}
        subtitulo={doc?.formatoOriginal ? `Hoja de cálculo · ${doc.formatoOriginal}` : undefined}
        atras
      />
      <View style={styles.zona}>{cuerpo}</View>
    </Sala>
  )
}

const styles = StyleSheet.create({
  zona: { flex: 1, minHeight: 0 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
})

export default HojaScreen
