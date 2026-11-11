import React, { useEffect, useRef, useState } from 'react'

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Deslizador from '@componentes/atoms/Deslizador'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import Encabezado, { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { BotonLaton, OndaVoz, SelectorVelocidad } from '@componentes/reproductor/ControlesVoz'
import { avisoDeVoz, duracionHumana, restanteLibro, textoRestante } from '@componentes/reproductor/estadoVoz'
import { useAhora } from '@componentes/reproductor/useAhora'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { motor, useVoz } from '@contextos/VozContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { autoresTexto, reloj } from '@logica/formato'
import { resaltaPalabra, textoVelocidad } from '@logica/velocidad'
import type { Rutas } from '@navegacion/linking'
import { urlMuestraVoz } from '@servicios/archivos'
import { librosService, vocesService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { luzLampara } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDetalleDTO, VozDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
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
  const muestra = useRef<HTMLAudioElement | null>(null)

  const { cargando, error, cargar } = useCarga(async () => {
    const [d, vs] = await Promise.all([librosService.detalle(id), vocesService.todas()])
    setLibro(exigir(d) ?? null)
    setVoces(vs.correct ? vs.object : [])
  })
  useEffect(() => {
    cargar()
  }, [cargar])

  const ahora = useAhora(!!v.temporizador || v.fase === 'preparando' || !!v.vozPendiente)

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
  /* Si suena OTRO libro, los controles de esta pantalla no lo tocan (QA LV-P3). */
  const siEste = (fn: () => void) => () => {
    if (esteLibro) fn()
  }
  const ponerVelocidad = (x: number) => {
    if (esteLibro) motor.setVelocidad(x)
    cambiar({ velocidad: x })
  }
  const aviso = esteLibro ? avisoDeVoz(v, ahora) : null
  const enError = esteLibro && v.fase === 'error'
  const quedaLibro = esteLibro ? restanteLibro(libro.capitulos, v.capitulo, v.posicion, v.duracion, v.velocidad) : null
  const conAudio = esteLibro && v.duracion > 0
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
        <View style={styles.capituloFila}>
          <OndaVoz activa={sonando} />
          <Text style={[styles.capitulo, { color: colors.text }]} accessibilityRole="header">
            {cap?.titulo ?? `Capítulo ${(esteLibro ? v.capitulo : 0) + 1}`}
          </Text>
          <OndaVoz activa={sonando} />
        </View>
        <Text style={[styles.autor, { color: colors.primary }]}>{autoresTexto(libro.autores)}</Text>

        {aviso ? (
          <View
            style={[
              styles.estado,
              { borderColor: aviso.tono === 'error' ? colors.danger : 'rgba(201,162,39,0.55)' },
              web({ backgroundImage: 'linear-gradient(180deg, rgba(243,233,210,0.06), rgba(0,0,0,0.12))' }),
            ]}
            accessibilityLiveRegion="polite"
            testID="aviso-voz"
          >
            <View style={styles.estadoFila}>
              {aviso.tono === 'espera' ? <ActivityIndicator color={SALA_ESCUCHA.laton} /> : null}
              <Text style={[styles.mensaje, { color: aviso.tono === 'error' ? colors.danger : colors.text }]}>
                {aviso.tono === 'error' ? '⚠ ' : ''}
                {aviso.texto}
              </Text>
            </View>
            {aviso.reintentar ? (
              <Button
                title="Reintentar"
                icono="volver"
                size="small"
                onPress={() => motor.reintentar()}
                testID="reintentar-voz"
              />
            ) : null}
            {v.vozPendiente ? (
              <Button
                title={`Seguir con ${v.nombreVoz}`}
                size="small"
                variant="ghost"
                onPress={() => motor.setVoz(v.vozId, v.nombreVoz)}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.avance}>
          {conAudio ? (
            <Deslizador
              valor={v.posicion}
              min={0}
              max={Math.max(1, v.duracion)}
              paso={1}
              etiqueta="Posición en el capítulo"
              textoValor={(x) => `${reloj(x)} de ${reloj(v.duracion)}`}
              onSoltar={(x) => motor.buscar(x)}
              testID="deslizador-posicion"
            />
          ) : (
            // Sin audio aún no hay nada que arrastrar: un riel quieto, no una barra que engaña (UX-11).
            <View style={styles.rielQuieto} accessibilityLabel="Posición en el capítulo: aún sin audio">
              <View style={[styles.riel, { backgroundColor: 'rgba(201,162,39,0.25)' }]} />
            </View>
          )}
          <View style={styles.tiempos}>
            <Text style={[styles.tiempo, { color: colors.textSecondary }]}>{conAudio ? reloj(v.posicion) : '—:—'}</Text>
            <Text style={[styles.tiempo, { color: colors.textSecondary }]} testID="tiempo-restante">
              {esteLibro ? textoRestante(v) : '—:—'}
            </Text>
          </View>
          {quedaLibro != null ? (
            <Text style={[styles.tiempo, styles.centro, { color: colors.textMuted }]}>
              Del libro quedan {duracionHumana(quedaLibro)} a {textoVelocidad(v.velocidad)}
            </Text>
          ) : null}
        </View>

        <View style={styles.controles}>
          <BotonIcono icono="anterior" etiqueta="Capítulo anterior" onPress={siEste(() => motor.capituloAnterior())} />
          <BotonIcono icono="fraseAnterior" etiqueta="Frase anterior" onPress={siEste(() => motor.fraseAnterior())} />
          <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={siEste(motor.atras15)} tamano={26} />
          <BotonLaton sonando={sonando} ocupado={ocupado} enError={enError} onPress={alternar} testID="boton-play" />
          <BotonIcono
            icono="adelante15"
            etiqueta="Adelantar 15 segundos"
            onPress={siEste(motor.adelante15)}
            tamano={26}
          />
          <BotonIcono
            icono="fraseSiguiente"
            etiqueta="Frase siguiente"
            onPress={siEste(() => motor.fraseSiguiente())}
          />
          <BotonIcono
            icono="siguiente"
            etiqueta="Capítulo siguiente"
            onPress={siEste(() => motor.capituloSiguiente())}
          />
        </View>

        <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="label">Velocidad</AppText>
          <SelectorVelocidad valor={esteLibro ? v.velocidad : prefs.velocidad} onCambio={ponerVelocidad} />
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
                onPress={siEste(() => motor.setTemporizador({ minutos: m }))}
              />
            ))}
            <Chip
              etiqueta="Al final del capítulo"
              activo={v.temporizador?.tipo === 'capitulo'}
              onPress={siEste(() => motor.setTemporizador('capitulo'))}
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
            const preparandose = esteLibro && v.vozPendiente?.id === vz.id
            return (
              <View key={vz.id} style={[styles.voz, { borderBottomColor: colors.border }]}>
                <Pressable
                  style={styles.vozNombre}
                  onPress={() => {
                    if (esteLibro) motor.setVoz(vz.id, vz.nombre)
                    cambiar({ vozId: vz.id })
                  }}
                  {...estadoElegible('radio', activa)}
                  accessibilityLabel={`${vz.nombre}, ${vz.pais}${vz.porDefecto ? ', voz de la casa' : ''}`}
                >
                  <Text style={[styles.vozTexto, { color: activa ? colors.primary : colors.text }]}>
                    {activa ? '● ' : preparandose ? '◌ ' : '○ '}
                    {vz.nombre}
                    {preparandose ? ' · preparándose…' : ''}
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
  capituloFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  capitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.xl, textAlign: 'center' },
  autor: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.lg, textAlign: 'center' },
  estado: {
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  estadoFila: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  mensaje: {
    fontFamily: fuentes.ui,
    fontSize: fontSize.sm,
    textAlign: 'center',
    flexShrink: 1,
    fontVariant: ['lining-nums'],
  },
  rielQuieto: { height: 44, justifyContent: 'center' },
  riel: { height: 6, borderRadius: 3 },
  centro: { textAlign: 'center' },
  avance: { gap: 2 },
  tiempos: { flexDirection: 'row', justifyContent: 'space-between' },
  tiempo: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    borderWidth: 1,
  },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voz: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  vozNombre: { flex: 1, minHeight: 48, justifyContent: 'center' },
  vozTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
})

export default ReproductorScreen
