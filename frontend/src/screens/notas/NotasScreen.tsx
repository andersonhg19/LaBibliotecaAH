import React, { useCallback, useEffect, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Spinner from '@componentes/atoms/Spinner'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { nombreColor, nombreTipo, ordenarAnotaciones } from '@logica/anotaciones'
import { fechaCorta } from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import { anotacionesService, librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { AnotacionDTO, EjemplarDTO } from '@tipos'

type Props = NativeStackScreenProps<Rutas, 'Notas'>

/*
 * MIS NOTAS: todos los resaltados y notas, libro por libro. El contrato no
 * tiene una lista global; se piden los libros "con notas" y luego las de cada
 * uno (son dos lectores: unas pocas peticiones).
 */
const NotasScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme()
  const [grupos, setGrupos] = useState<{ libro: EjemplarDTO; notas: AnotacionDTO[] }[]>([])

  const tarea = useCallback(async () => {
    const libros =
      exigir(
        await librosService.todos({ pestana: 'TODO', conNotas: true, orden: 'ULTIMO_ABIERTO', page: 0, size: 100 }),
      )?.list ?? []
    const con = await Promise.all(
      libros.map(async (l) => ({
        libro: l,
        notas: ordenarAnotaciones(exigir(await anotacionesService.todas(l.id)) ?? []),
      })),
    )
    setGrupos(con.filter((g) => g.notas.length))
  }, [])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <Sala>
      <Encabezado titulo="Mis notas" subtitulo="Resaltados y notas de todos tus libros" atras />
      <ScrollView contentContainerStyle={styles.contenido}>
        {cargando ? <Spinner /> : null}
        {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}
        {!cargando && !error && !grupos.length ? (
          <EmptyState
            title="Sin notas todavía"
            message="En el lector, selecciona un texto para resaltarlo o anotarlo."
            icon="nota"
          />
        ) : null}
        {grupos.map(({ libro, notas }) => (
          <View key={libro.id} style={styles.grupo}>
            <Text style={[styles.libro, { color: colors.primary }]} accessibilityRole="header">
              {libro.titulo}
            </Text>
            {notas.map((a) => (
              <Pressable
                key={a.id}
                onPress={() =>
                  navigation.navigate('Leer', {
                    id: libro.id,
                    ...(a.fraseInicio ? { frase: a.fraseInicio } : {}),
                    ...(a.cfi ? { cfi: a.cfi } : {}),
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${nombreTipo(a)} en ${nombreColor(a.color)}: ${a.textoCitado ?? ''}. Abrir en el libro`}
                style={[styles.nota, { backgroundColor: colors.card, borderLeftColor: a.color ?? colors.primary }]}
              >
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {nombreTipo(a)} · {nombreColor(a.color)} · cap. {(a.capitulo ?? 0) + 1} · {fechaCorta(a.creado)}
                </Text>
                {a.textoCitado ? <Text style={[styles.cita, { color: colors.text }]}>«{a.textoCitado}»</Text> : null}
                {a.nota ? <Text style={[styles.texto, { color: colors.primary }]}>✎ {a.nota}</Text> : null}
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 18, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  grupo: { gap: 8 },
  libro: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.xl },
  nota: { borderLeftWidth: 4, borderRadius: 6, padding: 12, gap: 4, minHeight: 44 },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  cita: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 22 },
  texto: { fontFamily: fuentes.ui, fontSize: fontSize.sm },
})

export default NotasScreen
