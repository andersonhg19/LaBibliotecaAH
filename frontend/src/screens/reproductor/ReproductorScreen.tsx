import React, { useEffect, useRef, useState } from 'react'

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Deslizador from '@componentes/atoms/Deslizador'
import Icono from '@componentes/atoms/Icono'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import Encabezado, { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { motor, useVoz } from '@contextos/VozContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { autoresTexto, reloj } from '@logica/formato'
import {
  PASOS_VELOCIDAD,
  PASO_FINO,
  VELOCIDAD_MAX,
  VELOCIDAD_MIN,
  resaltaPalabra,
  textoVelocidad,
} from '@logica/velocidad'
import type { Rutas } from '@navegacion/linking'
import { urlMuestraVoz } from '@servicios/archivos'
import { librosService, vocesService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { luzLampara } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDetalleDTO, VozDTO } from '@tipos'
import { escucharLibro } from '@utils/escuchar'

type Props = NativeStackScreenProps<Rutas, 'Escuchar'>

const TEMPORIZADORES = [5, 10, 15, 30, 45, 60]

/*
 * EL REPRODUCTOR COMPLETO: la portada bajo la lámpara, el capítulo, el avance,
 * los saltos (capítulo, frase, 15 s), la velocidad de 0.5x a 5x, la voz (con
 * muestras) y el temporizador para dormirse con el libro.
 */
const ReproductorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id } = route.params
  const { colors, isDark } = useTheme()
  const { prefs, cambiar } = usePreferencias()
  const v = useVoz()
  const { width } = useWindowDimensions()
  const [libro, setLibro] = useState<EjemplarDetalleDTO | null>(null)
  const [voces, setVoces] = useState<VozDTO[]>([])
  const [ahora, setAhora] = useState(Date.now())
  const muestra = useRef<HTMLAudioElement | null>(null)

  const { cargando, error, cargar } = useCarga(async () => {
    const [d, vs] = await Promise.all([librosService.detalle(id), vocesService.todas()])
    setLibro(exigir(d) ?? null)
    setVoces(vs.correct ? vs.object : [])
  })
  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!v.temporizador) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [v.temporizador])

  useEffect(() => () => muestra.current?.pause(), [])

  if (cargando && !libro) return <Spinner fullScreen />
  if (error && !libro) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!libro) return null

  const esteLibro = v.libro?.ejemplarId === id
  const sonando = esteLibro && v.fase === 'reproduciendo'
  const ocupado = esteLibro && (v.fase === 'cargando' || v.fase === 'preparando')
  const cap = libro.capitulos.find((c) => c.indice === (esteLibro ? v.capitulo : (libro.progreso?.capitulo ?? 0)))
  const anchoPortada = Math.min(260, width * 0.6)

  const empezar = () => escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad })
  const alternar = () => (esteLibro ? motor.alternar() : empezar())
  const ponerVelocidad = (x: number) => {
    motor.setVelocidad(x)
    cambiar({ velocidad: x })
  }
  const restante =
    v.temporizador?.tipo === 'minutos' ? Math.max(0, Math.round((v.temporizador.finEn - ahora) / 1000)) : null

  return (
    <Sala>
      <Encabezado
        titulo="Escuchando"
        subtitulo={libro.titulo}
        atras
        acciones={[
          {
            icono: 'libroAbierto',
            etiqueta: 'Leer siguiendo la voz',
            onPress: () => navigation.navigate('Leer', { id }),
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={[styles.portada, web({ backgroundImage: luzLampara(isDark) })]}>
          <Portada libro={libro} ancho={anchoPortada} />
        </View>
        <Text style={[styles.capitulo, { color: colors.text }]} accessibilityRole="header">
          {cap?.titulo ?? `Capítulo ${(esteLibro ? v.capitulo : 0) + 1}`}
        </Text>
        <Text style={[styles.autor, { color: colors.primary }]}>{autoresTexto(libro.autores)}</Text>

        {esteLibro && v.mensaje ? (
          <View style={styles.estado} accessibilityLiveRegion="polite">
            {v.fase === 'preparando' ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={[styles.mensaje, { color: v.fase === 'error' ? colors.danger : colors.textSecondary }]}>
              {v.fase === 'error' ? '⚠ ' : ''}
              {v.mensaje}
            </Text>
          </View>
        ) : null}

        <View style={styles.avance}>
          <Deslizador
            valor={esteLibro ? v.posicion : 0}
            min={0}
            max={Math.max(1, esteLibro ? v.duracion : 1)}
            paso={1}
            etiqueta="Posición en el capítulo"
            textoValor={(x) => `${reloj(x)} de ${reloj(v.duracion)}`}
            onSoltar={(x) => esteLibro && motor.buscar(x)}
            testID="deslizador-posicion"
          />
          <View style={styles.tiempos}>
            <Text style={[styles.tiempo, { color: colors.textSecondary }]}>{reloj(esteLibro ? v.posicion : 0)}</Text>
            <Text style={[styles.tiempo, { color: colors.textSecondary }]}>
              -{reloj(Math.max(0, (v.duracion - v.posicion) / (v.velocidad || 1)))} a {textoVelocidad(v.velocidad)}
            </Text>
          </View>
        </View>

        <View style={styles.controles}>
          <BotonIcono icono="anterior" etiqueta="Capítulo anterior" onPress={() => motor.capituloAnterior()} />
          <BotonIcono icono="fraseAnterior" etiqueta="Frase anterior" onPress={() => motor.fraseAnterior()} />
          <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={motor.atras15} tamano={26} />
          <Pressable
            onPress={alternar}
            accessibilityRole="button"
            accessibilityLabel={sonando ? 'Pausar' : 'Reproducir'}
            testID="boton-play"
            style={({ pressed }) => [
              styles.play,
              { backgroundColor: colors.primary },
              web({
                backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), rgba(0,0,0,0.15))',
                boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
                cursor: 'pointer',
              }),
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            {ocupado ? (
              <ActivityIndicator color={textoLegibleSobre(colors.primary)} />
            ) : (
              <Icono
                nombre={sonando ? 'pause' : 'play'}
                color={textoLegibleSobre(colors.primary)}
                tamano={34}
                relleno
              />
            )}
          </Pressable>
          <BotonIcono icono="adelante15" etiqueta="Adelantar 15 segundos" onPress={motor.adelante15} tamano={26} />
          <BotonIcono icono="fraseSiguiente" etiqueta="Frase siguiente" onPress={() => motor.fraseSiguiente()} />
          <BotonIcono icono="siguiente" etiqueta="Capítulo siguiente" onPress={() => motor.capituloSiguiente()} />
        </View>

        <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="label">Velocidad: {textoVelocidad(v.velocidad)}</AppText>
          <View style={styles.chips}>
            {PASOS_VELOCIDAD.map((p) => (
              <Chip
                key={p}
                etiqueta={textoVelocidad(p)}
                activo={Math.abs(v.velocidad - p) < 0.001}
                onPress={() => ponerVelocidad(p)}
              />
            ))}
          </View>
          <Deslizador
            valor={v.velocidad}
            min={VELOCIDAD_MIN}
            max={VELOCIDAD_MAX}
            paso={PASO_FINO}
            etiqueta="Velocidad fina"
            textoValor={textoVelocidad}
            onSoltar={ponerVelocidad}
          />
          <AppText variant="caption">
            {resaltaPalabra(v.velocidad)
              ? 'Se resalta la frase y la palabra.'
              : 'A esta velocidad se resalta solo la frase.'}
          </AppText>
        </View>

        <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="label">Temporizador</AppText>
          <View style={styles.chips}>
            {TEMPORIZADORES.map((m) => (
              <Chip
                key={m}
                etiqueta={`${m} min`}
                icono="temporizador"
                activo={v.temporizador?.tipo === 'minutos' && v.temporizador.minutos === m}
                onPress={() => motor.setTemporizador({ minutos: m })}
              />
            ))}
            <Chip
              etiqueta="Al final del capítulo"
              activo={v.temporizador?.tipo === 'capitulo'}
              onPress={() => motor.setTemporizador('capitulo')}
            />
            {v.temporizador ? (
              <Chip
                etiqueta="Quitar"
                quitable
                onPress={() => motor.setTemporizador(null)}
                accessibilityLabel="Quitar el temporizador"
              />
            ) : null}
          </View>
          {restante != null ? (
            <AppText variant="caption">Se apaga en {reloj(restante)} (con un fundido de 10 s).</AppText>
          ) : null}
        </View>

        <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="label">La voz</AppText>
          {voces.map((vz) => {
            const activa = (esteLibro ? v.vozId : prefs.vozId) === vz.id
            return (
              <View key={vz.id} style={[styles.voz, { borderBottomColor: colors.border }]}>
                <Pressable
                  style={styles.vozNombre}
                  onPress={() => {
                    motor.setVoz(vz.id, vz.nombre)
                    cambiar({ vozId: vz.id })
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activa }}
                  accessibilityLabel={`${vz.nombre}, ${vz.pais}${vz.porDefecto ? ', voz de la casa' : ''}`}
                >
                  <Text style={[styles.vozTexto, { color: activa ? colors.primary : colors.text }]}>
                    {activa ? '● ' : '○ '}
                    {vz.nombre}
                  </Text>
                  <Text style={[styles.tiempo, { color: colors.textMuted }]}>
                    {vz.pais}
                    {vz.porDefecto ? ' · la de la casa' : ''}
                  </Text>
                </Pressable>
                <BotonIcono
                  icono="play"
                  etiqueta={`Escuchar una muestra de ${vz.nombre}`}
                  onPress={() => {
                    if (typeof Audio === 'undefined') return
                    motor.pausar()
                    muestra.current?.pause()
                    muestra.current = new Audio(urlMuestraVoz(vz.id))
                    muestra.current.play().catch(() => {})
                  }}
                />
              </View>
            )
          })}
        </View>
        {!esteLibro ? <Button title="Escuchar este libro" icono="auriculares" onPress={empezar} size="large" /> : null}
      </ScrollView>
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: {
    padding: 16,
    gap: 14,
    paddingBottom: 80,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  portada: { alignItems: 'center', padding: 28 },
  capitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.xl, textAlign: 'center' },
  autor: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.lg, textAlign: 'center' },
  estado: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  mensaje: { fontFamily: fuentes.ui, fontSize: fontSize.sm, textAlign: 'center' },
  avance: { gap: 2 },
  tiempos: { flexDirection: 'row', justifyContent: 'space-between' },
  tiempo: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voz: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  vozNombre: { flex: 1, minHeight: 48, justifyContent: 'center' },
  vozTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
})

export default ReproductorScreen
