import React, { useCallback, useEffect, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import Esqueleto from '@componentes/atoms/Esqueleto'
import AppText from '@componentes/atoms/Text'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { diaLegible, periodo, rellenarDias, textoRacha } from '@logica/estadisticas'
import { duracion } from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import { librosService } from '@servicios/bibliotecaService'
import { obtenerResumen } from '@servicios/sesionesService'
import { fontSize, fuentes } from '@tema'
import { panel } from '@tema/materiales'
import { web } from '@tema/web'
import type { ResumenSesionesDTO } from '@tipos'
import { mensajeDelServidor } from '@utils/mensajes'

/*
 * TUS LECTURAS (F12, contrato C4): la racha de días seguidos leyendo o
 * escuchando, los minutos de cada día del último mes y los libros con más
 * tiempo. Una sola serie (minutos por día) en barras de latón: no necesita
 * leyenda; cada barra dice su día y sus minutos al pasar el ratón y al lector
 * de pantalla, y el mejor día va destacado y escrito. Las barras crecen al llegar (CSS `bah-crece`; con «Reducir
 * movimiento», quietas).
 */

export const DIAS_PERIODO = 30

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sinServidor' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; datos: ResumenSesionesDTO; titulos: Record<string, string> }

const EstadisticasScreen: React.FC = () => {
  const { colors, isDark } = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const { width } = useWindowDimensions()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const { desde, hasta } = periodo(DIAS_PERIODO)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    try {
      const r = await obtenerResumen(desde, hasta)
      if (!r.correct) throw new Error(r.message)
      const top = [...(r.object.libros ?? [])].sort((a, b) => b.minutos - a.minutos).slice(0, 5)
      const titulos: Record<string, string> = {}
      await Promise.all(
        top.map(async (l) => {
          try {
            const d = await librosService.detalle(l.ejemplarId)
            if (d.correct) titulos[l.ejemplarId] = d.object.titulo
          } catch {
            /* un libro borrado: queda sin título */
          }
        }),
      )
      setEstado({ tipo: 'listo', datos: { ...r.object, libros: top }, titulos })
    } catch (e) {
      const st = (e as { response?: { status?: number } } | null)?.response?.status
      if (st === 404 || st === 405) setEstado({ tipo: 'sinServidor' })
      else setEstado({ tipo: 'error', mensaje: mensajeDelServidor(e, 'No se pudieron cargar tus lecturas.') })
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const tarjeta = [
    styles.tarjeta,
    { backgroundColor: colors.surface, borderColor: colors.border },
    web(panel(isDark, colors)),
  ]

  let cuerpo: React.ReactNode
  if (estado.tipo === 'cargando') cuerpo = <Esqueleto variante="ficha" ancho={Math.min(width, 720)} />
  else if (estado.tipo === 'sinServidor')
    cuerpo = (
      <EmptyState
        title="Pronto"
        message="Las estadísticas llegan con la próxima versión de la casa. Mientras tanto, tus lecturas no se pierden."
        icon="barras"
      />
    )
  else if (estado.tipo === 'error') cuerpo = <EstadoError mensaje={estado.mensaje} onReintentar={cargar} />
  else {
    const d = estado.datos
    const dias = rellenarDias(d.dias ?? [], desde, hasta)
    const max = Math.max(1, ...dias.map((x) => x.minutos))
    const total = (d.minutosLectura ?? 0) + (d.minutosVoz ?? 0)
    const mejor = dias.reduce<(typeof dias)[number] | null>((m, x) => (x.minutos > (m?.minutos ?? 0) ? x : m), null)
    const altoGrafico = 140
    cuerpo =
      total <= 0 && !d.rachaActual ? (
        <EmptyState
          title="Aún no hay lecturas"
          message="Lee o escucha un rato y aquí verás tus minutos de cada día y tu racha."
          icon="barras"
        />
      ) : (
        <>
          <View style={styles.cifras}>
            <View style={[tarjeta, styles.cifra]} accessible accessibilityLabel={`Racha: ${textoRacha(d.rachaActual)}`}>
              <Text style={[styles.numero, { color: colors.text }]}>{d.rachaActual || 0}</Text>
              <Text style={[styles.rotulo, { color: colors.textSecondary }]}>
                {d.rachaActual === 1 ? 'día de racha' : 'días de racha'}
              </Text>
              <Text style={[styles.detalle, { color: colors.textMuted }]}>
                Tu mejor racha: {textoRacha(d.rachaMaxima)}
              </Text>
            </View>
            <View
              style={[tarjeta, styles.cifra]}
              accessible
              accessibilityLabel={`En ${DIAS_PERIODO} días: ${duracion(d.minutosLectura)} leyendo y ${duracion(d.minutosVoz)} escuchando`}
            >
              <Text style={[styles.numero, { color: colors.text }]}>{duracion(total)}</Text>
              <Text style={[styles.rotulo, { color: colors.textSecondary }]}>en {DIAS_PERIODO} días</Text>
              <Text style={[styles.detalle, { color: colors.textMuted }]}>
                {duracion(d.minutosLectura)} leyendo · {duracion(d.minutosVoz)} escuchando
              </Text>
            </View>
          </View>

          <View style={tarjeta}>
            <AppText variant="subtitle" nivel={2}>
              Minutos por día
            </AppText>
            <Text style={[styles.detalle, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
              {mejor ? `Tu mejor día: ${diaLegible(mejor.fecha)}, ${duracion(mejor.minutos)}.` : ' '}
            </Text>
            <View
              style={[styles.grafico, { height: altoGrafico, borderBottomColor: colors.border }]}
              testID="grafico-dias"
            >
              {dias.map((x, i) => {
                const alto = x.minutos > 0 ? Math.max(4, Math.round((x.minutos / max) * altoGrafico)) : 0
                return (
                  <View
                    key={x.fecha}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`${diaLegible(x.fecha)}: ${x.minutos ? duracion(x.minutos) : 'sin lectura'}`}
                    style={styles.columna}
                    testID={`dia-${x.fecha}`}
                    {...({
                      title: `${diaLegible(x.fecha)}: ${x.minutos ? duracion(x.minutos) : 'sin lectura'}`,
                    } as object)}
                  >
                    <View
                      style={[
                        styles.barra,
                        {
                          height: alto,
                          backgroundColor: x.fecha === mejor?.fecha ? colors.primary : colors.primaryLight,
                        },
                        web({
                          transformOrigin: 'bottom',
                          animationName: 'bah-crece',
                          animationDuration: '520ms',
                          animationDelay: `${i * 12}ms`,
                          animationFillMode: 'both',
                          animationTimingFunction: 'cubic-bezier(.2,.8,.2,1)',
                        }),
                      ]}
                    />
                  </View>
                )
              })}
            </View>
            <View style={styles.ejes}>
              <Text style={[styles.detalle, { color: colors.textMuted }]}>{diaLegible(dias[0].fecha)}</Text>
              <Text style={[styles.detalle, { color: colors.textMuted }]}>hoy</Text>
            </View>
          </View>

          {d.libros?.length ? (
            <View style={tarjeta}>
              <AppText variant="subtitle" nivel={2}>
                Con más tiempo
              </AppText>
              {d.libros.map((l) => (
                <Pressable
                  key={l.ejemplarId}
                  onPress={() => navigation.navigate('Libro', { id: l.ejemplarId })}
                  accessibilityRole="button"
                  accessibilityLabel={`${estado.titulos[l.ejemplarId] ?? 'Un libro'}: ${duracion(l.minutos)}. Abrir la ficha`}
                  style={[styles.libro, { borderBottomColor: colors.border }, web({ cursor: 'pointer' })]}
                >
                  <Text style={[styles.libroTitulo, { color: colors.text }]} numberOfLines={2}>
                    {estado.titulos[l.ejemplarId] ?? 'Un libro que ya no está'}
                  </Text>
                  <Text style={[styles.detalle, { color: colors.textSecondary }]}>{duracion(l.minutos)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )
  }

  return (
    <Sala testID="pantalla-estadisticas">
      <Encabezado titulo="Tus lecturas" atras />
      <ScrollView contentContainerStyle={styles.contenido}>{cuerpo}</ScrollView>
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  tarjeta: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cifra: { flexGrow: 1, flexBasis: 220, gap: 4 },
  numero: { fontFamily: fuentes.tituloNegrita, fontSize: 44, lineHeight: 48, fontVariant: ['lining-nums'] },
  rotulo: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  detalle: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1 },
  columna: { flex: 1, height: '100%', justifyContent: 'flex-end', minWidth: 6 },
  barra: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  ejes: { flexDirection: 'row', justifyContent: 'space-between' },
  libro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  libroTitulo: { flex: 1, fontFamily: fuentes.titulo, fontSize: fontSize.md, fontVariant: ['lining-nums'] },
})

export default EstadisticasScreen
