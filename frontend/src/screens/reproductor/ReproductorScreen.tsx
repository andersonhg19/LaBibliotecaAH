import React, { useCallback, useEffect, useRef, useState } from 'react'

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Deslizador from '@componentes/atoms/Deslizador'
import Icono from '@componentes/atoms/Icono'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import Encabezado, { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { BotonLaton, OndaVoz, SelectorVelocidad } from '@componentes/reproductor/ControlesVoz'
import HojaCapitulos, { textoPosicion } from '@componentes/reproductor/HojaCapitulos'
import ModoCine, { TEXTOS_CINE } from '@componentes/reproductor/ModoCine'
import PanelTexto from '@componentes/reproductor/PanelTexto'
import Pastilla from '@componentes/reproductor/Pastilla'
import SelloGuardado from '@componentes/reproductor/SelloGuardado'
import TarjetaCapitulo from '@componentes/reproductor/TarjetaCapitulo'
import { avisoDeVoz, duracionHumana, restanteLibro, textoRestante } from '@componentes/reproductor/estadoVoz'
import { useAhora } from '@componentes/reproductor/useAhora'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { motor, useVoz } from '@contextos/VozContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { autoresTexto, reloj } from '@logica/formato'
import { idDeFrase } from '@logica/tiempos'
import { resaltaPalabra, textoVelocidad } from '@logica/velocidad'
import type { Rutas } from '@navegacion/linking'
import { urlMuestraVoz } from '@servicios/archivos'
import { librosService, vocesService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { luzLampara } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDetalleDTO, VozDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { escucharLibro, inicioDeEscucha } from '@utils/escuchar'
import { faltaTemporizador } from '@utils/motorAudio'

type Props = NativeStackScreenProps<Rutas, 'Escuchar'>

const TEMPORIZADORES = [5, 10, 15, 30, 45, 60]

/** Alto aproximado de la cabecera, de la barra de controles fija y de título + autor + pastillas. */
const ALTO_CABECERA = 60
const ALTO_BARRA = 200
const ALTO_TITULOS = 150

/**
 * El tamaño de la portada según el sitio que hay (UX5-01): de pie, lo que deja
 * la barra de controles fija y los títulos (como mucho el 36 % del alto); en
 * apaisado, el alto de la columna izquierda. Nunca menos de 80 px de ancho.
 */
export function anchoDePortada(width: number, height: number, apaisado: boolean): number {
  const alto = apaisado
    ? height - ALTO_CABECERA - 48
    : Math.min(height * 0.36, height - ALTO_CABECERA - ALTO_BARRA - ALTO_TITULOS)
  const ancho = Math.min(260, (apaisado ? width * 0.36 : width * 0.6) - 16, alto / 1.5)
  return Math.round(Math.max(80, ancho))
}

/*
 * EL REPRODUCTOR COMPLETO: la portada bajo la lámpara, el capítulo, el avance,
 * los saltos (capítulo, frase, 15 s), la velocidad de 0,5x a 5x, la voz (con
 * muestras) y el temporizador para dormirse con el libro.
 *
 * 0.4.0 (UX5-01/UX5-07): el avance y los botones van en una BARRA FIJA abajo
 * (con la zona segura del iPhone), siempre a la vista sin desplazar; la portada
 * se ajusta al alto. En horizontal, dos columnas: portada | lo demás.
 * Ola E: tarjeta de fin de capítulo (F4), anillo de preparación (F6), halo con
 * la voz (F7), modo cine (F8) y sello de guardado (F10).
 */
const ReproductorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id } = route.params
  const { colors, isDark } = useTheme()
  const { prefs, cambiar } = usePreferencias()
  const v = useVoz()
  const { width, height } = useWindowDimensions()
  const [libro, setLibro] = useState<EjemplarDetalleDTO | null>(null)
  const [voces, setVoces] = useState<VozDTO[]>([])
  const muestra = useRef<HTMLAudioElement | null>(null)
  const [textoAbierto, setTextoAbierto] = useState(false)
  const [cineAbierto, setCineAbierto] = useState(false)
  const [capitulosAbiertos, setCapitulosAbiertos] = useState(false)
  /* La lista de voces, plegada: se ve la elegida y se abre solo para cambiarla (acordado 2026-11-12). */
  const [vocesAbiertas, setVocesAbiertas] = useState(false)
  /* Lo que hace tocar una frase del panel; en una ref para que el panel (memo) no se repinte en cada avance. */
  const tocarFraseActual = useRef<(fraseId: string) => void>(() => {})
  const tocarFrase = useCallback((fraseId: string) => tocarFraseActual.current(fraseId), [])
  const cerrarTexto = useCallback(() => setTextoAbierto(false), [])
  const cerrarCine = useCallback(() => setCineAbierto(false), [])

  /*
   * V-NUEVO-1 (0.4.0): la tarea va memorizada por `id`. Una función nueva en cada
   * render cambiaba `cargar` en cada render, el efecto volvía a pedir, el
   * resultado repintaba… y así ~100 peticiones por segundo mientras el
   * reproductor estaba abierto (también en 0.3.3).
   */
  const tarea = useCallback(async () => {
    const [d, vs] = await Promise.all([librosService.detalle(id), vocesService.todas()])
    setLibro(exigir(d) ?? null)
    setVoces(vs.correct ? vs.object : [])
  }, [id])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  const ahora = useAhora(!!v.temporizador || v.fase === 'preparando' || !!v.vozPendiente)

  useEffect(() => () => muestra.current?.pause(), [])

  if (cargando && !libro) return <Spinner fullScreen />
  if (error && !libro) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!libro) return null

  const esteLibro = v.libro?.ejemplarId === id
  const vozElegida = voces.find((vz) => vz.id === (esteLibro ? v.vozId : prefs.vozId)) ?? null
  const sonando = esteLibro && v.fase === 'reproduciendo'
  const ocupado = esteLibro && (v.fase === 'cargando' || v.fase === 'preparando')
  /* Antes de empezar, el capítulo que va a sonar (sin progreso, el primero con voz: V-NUEVO-6). */
  const capActual = esteLibro ? v.capitulo : inicioDeEscucha(libro, { vozId: prefs.vozId }).capitulo
  const cap = libro.capitulos.find((c) => c.indice === capActual)
  const tituloCap = cap?.titulo ?? `Capítulo ${capActual + 1}`
  const apaisado = width > height && height < 560
  const estrecho = width < 360
  const anchoPortada = anchoDePortada(width, height, apaisado)

  const empezar = () => escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad })
  /* Desde una frase o un capítulo: si suena este libro se salta ahí; si no, empieza ahí. */
  const irA = (fraseId: string) =>
    esteLibro
      ? motor.irAFrase(fraseId)
      : escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad, desdeFrase: fraseId })
  tocarFraseActual.current = irA
  const elegirCapitulo = (indice: number) => (esteLibro ? motor.irACapitulo(indice) : irA(idDeFrase(indice, 0)))
  const posicionCap = textoPosicion(libro.capitulos, capActual, libro.titulo)
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
  const restante = faltaTemporizador(v.temporizador, ahora)
  /* F6: lo preparado de verdad (lo que ha bajado la cinta, o lo que va de la espera estimada del taller). */
  const progreso = !esteLibro
    ? null
    : v.fase === 'cargando' && v.carga != null
      ? v.carga
      : v.fase === 'preparando' && v.preparacion
        ? Math.min(0.95, (ahora - v.preparacion.desde) / 1000 / Math.max(1, v.preparacion.estimadoSeg))
        : null
  const nivel = esteLibro ? motor.nivelVoz : undefined

  const portada = (
    <View style={[styles.portada, web({ backgroundImage: luzLampara(isDark) })]}>
      <Portada libro={libro} ancho={anchoPortada} />
    </View>
  )

  const barra = (
    <View
      style={[
        styles.barra,
        { borderTopColor: 'rgba(201,162,39,0.35)', backgroundColor: colors.surface },
        web({
          paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
          boxShadow: '0 -10px 24px rgba(0,0,0,0.28)',
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.10))',
        }),
      ]}
      accessibilityRole="toolbar"
      accessibilityLabel="Controles de la voz"
      testID="barra-controles"
    >
      {esteLibro ? (
        <View style={styles.sobreBarra} pointerEvents="box-none">
          <TarjetaCapitulo v={v} capitulos={libro.capitulos} onVolverAEmpezar={() => motor.volverAEmpezar()} />
        </View>
      ) : null}
      <View style={styles.barraDentro}>
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
            {quedaLibro != null && !apaisado ? (
              <Text style={[styles.tiempo, { color: colors.textMuted }]} numberOfLines={1}>
                Libro: {duracionHumana(quedaLibro)}
              </Text>
            ) : null}
            <Text style={[styles.tiempo, { color: colors.textSecondary }]} testID="tiempo-restante">
              {esteLibro ? textoRestante(v) : '—:—'}
            </Text>
          </View>
        </View>
        <View style={styles.controles}>
          <BotonIcono icono="anterior" etiqueta="Capítulo anterior" onPress={siEste(() => motor.capituloAnterior())} />
          {!estrecho ? (
            <BotonIcono icono="fraseAnterior" etiqueta="Frase anterior" onPress={siEste(() => motor.fraseAnterior())} />
          ) : null}
          <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={siEste(motor.atras15)} tamano={26} />
          <BotonLaton
            sonando={sonando}
            ocupado={ocupado}
            enError={enError}
            onPress={alternar}
            testID="boton-play"
            tamano={estrecho || apaisado ? 64 : 76}
            progreso={progreso}
            nivel={nivel}
          />
          <BotonIcono
            icono="adelante15"
            etiqueta="Adelantar 15 segundos"
            onPress={siEste(motor.adelante15)}
            tamano={26}
          />
          {!estrecho ? (
            <BotonIcono
              icono="fraseSiguiente"
              etiqueta="Frase siguiente"
              onPress={siEste(() => motor.fraseSiguiente())}
            />
          ) : null}
          <BotonIcono
            icono="siguiente"
            etiqueta="Capítulo siguiente"
            onPress={siEste(() => motor.capituloSiguiente())}
          />
        </View>
      </View>
    </View>
  )

  return (
    <Sala>
      <Encabezado
        titulo="Escuchando"
        subtitulo={libro.titulo}
        atras
        acciones={[
          ...(esteLibro
            ? [{ icono: 'lampara', etiqueta: TEXTOS_CINE.abrir, onPress: () => setCineAbierto(true) }]
            : []),
          {
            icono: 'libroAbierto',
            etiqueta: 'Leer siguiendo la voz',
            onPress: () => navigation.navigate('Leer', { id }),
          },
        ]}
      />
      <View style={[styles.cuerpo, apaisado && styles.cuerpoApaisado]}>
        {apaisado ? <View style={styles.columnaPortada}>{portada}</View> : null}
        <View style={styles.columna}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.contenido, estrecho && styles.contenidoEstrecho]}
          >
            {!apaisado ? portada : null}
            <View style={styles.capituloFila}>
              <OndaVoz activa={sonando} nivel={nivel} />
              <Text style={[styles.capitulo, { color: colors.text }]} accessibilityRole="header">
                {tituloCap}
              </Text>
              <OndaVoz activa={sonando} nivel={nivel} />
            </View>
            <Text style={[styles.autor, { color: colors.primary }]}>{autoresTexto(libro.autores)}</Text>
            {libro.capitulos.length > 0 || libro.archivoId ? (
              <View style={styles.pastillas}>
                {libro.capitulos.length > 0 ? (
                  <Pastilla
                    icono="indice"
                    texto={posicionCap}
                    etiqueta={`Capítulos: ${posicionCap}, ${tituloCap}. Abrir la lista`}
                    desplegable
                    abierta={capitulosAbiertos}
                    onPress={() => setCapitulosAbiertos(true)}
                    testID="fila-capitulo"
                  />
                ) : null}
                {libro.archivoId ? (
                  <Pastilla
                    icono="texto"
                    texto="Ver texto"
                    etiqueta="Ver el texto que se está leyendo"
                    onPress={() => setTextoAbierto(true)}
                    testID="boton-ver-texto"
                  />
                ) : null}
              </View>
            ) : null}
            {esteLibro && v.fase !== 'reproduciendo' ? <SelloGuardado guardado={v.guardado} /> : null}
            {esteLibro && v.escuchaContinua === 'apagada' ? (
              <Text style={[styles.nota, { color: colors.textMuted }]} testID="aviso-cinta-apagada">
                ⚠ La escucha continua con la pantalla bloqueada se apagó por un fallo. Vuelve a abrir la app para
                recuperarla.
              </Text>
            ) : null}

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

            {!esteLibro ? (
              <Button title="Escuchar este libro" icono="auriculares" onPress={empezar} size="large" />
            ) : null}

            <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppText variant="label">Velocidad</AppText>
              <SelectorVelocidad valor={esteLibro ? v.velocidad : prefs.velocidad} onCambio={ponerVelocidad} />
              <AppText variant="caption">
                {resaltaPalabra(v.velocidad)
                  ? 'Se resalta la frase y la palabra.'
                  : 'A esta velocidad se resalta solo la frase.'}
              </AppText>
              {quedaLibro != null && apaisado ? (
                <AppText variant="caption">
                  Del libro quedan {duracionHumana(quedaLibro)} a {textoVelocidad(v.velocidad)}
                </AppText>
              ) : null}
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
                <AppText variant="caption">
                  {v.temporizador?.tipo === 'minutos' && v.temporizador.pausadoCon != null
                    ? `En pausa: quedan ${reloj(restante)} (cuenta solo mientras suena).`
                    : `Se apaga en ${reloj(restante)} (con un fundido de 10 s).`}
                </AppText>
              ) : null}
            </View>

            <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setVocesAbiertas((a) => !a)}
                accessibilityRole="button"
                accessibilityState={{ expanded: vocesAbiertas }}
                accessibilityLabel={`La voz: ${vozElegida ? `${vozElegida.nombre}, ${vozElegida.pais}` : 'sin elegir'}. ${vocesAbiertas ? 'Ocultar' : 'Cambiar'} la voz`}
                testID="acordeon-voz"
                style={({ pressed }) => [styles.acordeon, pressed && { opacity: 0.7 }, web({ cursor: 'pointer' })]}
              >
                <View style={styles.vozNombre}>
                  <AppText variant="label">La voz</AppText>
                  {vozElegida ? (
                    <Text style={[styles.vozTexto, { color: colors.primary }]}>
                      {vozElegida.nombre}
                      <Text style={[styles.tiempo, { color: colors.textMuted }]}> · {vozElegida.pais}</Text>
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.tiempo, { color: colors.textMuted }]}>
                  {vocesAbiertas ? 'Ocultar' : 'Cambiar'}
                </Text>
                <Icono nombre={vocesAbiertas ? 'up' : 'down'} color={colors.textMuted} tamano={18} />
              </Pressable>
              {(vocesAbiertas ? voces : []).map((vz) => {
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
          </ScrollView>
          {barra}
        </View>
      </View>
      <HojaCapitulos
        visible={capitulosAbiertos}
        capitulos={libro.capitulos}
        actual={capActual}
        tituloLibro={libro.titulo}
        onElegir={elegirCapitulo}
        onCerrar={() => setCapitulosAbiertos(false)}
      />
      <PanelTexto
        visible={textoAbierto}
        onCerrar={cerrarTexto}
        archivoId={libro.archivoId}
        capitulo={capActual}
        titulo={tituloCap}
        fraseId={esteLibro ? v.fraseId : null}
        onTocarFrase={tocarFrase}
        pie={
          <>
            <BotonIcono icono="fraseAnterior" etiqueta="Frase anterior" onPress={siEste(() => motor.fraseAnterior())} />
            <BotonIcono icono="atras15" etiqueta="Retroceder 15 segundos" onPress={siEste(motor.atras15)} tamano={24} />
            <BotonLaton
              sonando={sonando}
              ocupado={ocupado}
              enError={enError}
              onPress={alternar}
              tamano={52}
              testID="boton-play-texto"
            />
            <BotonIcono
              icono="adelante15"
              etiqueta="Adelantar 15 segundos"
              onPress={siEste(motor.adelante15)}
              tamano={24}
            />
            <BotonIcono
              icono="fraseSiguiente"
              etiqueta="Frase siguiente"
              onPress={siEste(() => motor.fraseSiguiente())}
            />
          </>
        }
        testID="panel-texto"
      />
      {esteLibro ? (
        <ModoCine
          visible={cineAbierto}
          onCerrar={cerrarCine}
          archivoId={libro.archivoId}
          capitulo={capActual}
          titulo={`${libro.titulo} · ${tituloCap}`}
          fraseId={v.fraseId}
          sonando={sonando}
          ocupado={ocupado}
          enError={enError}
          onAlternar={alternar}
          onFraseAnterior={() => motor.fraseAnterior()}
          onFraseSiguiente={() => motor.fraseSiguiente()}
          suscribirFrase={motor.suscribirFrase}
          nivel={nivel}
        />
      ) : null}
    </Sala>
  )
}

const styles = StyleSheet.create({
  cuerpo: { flex: 1, minHeight: 0 },
  cuerpoApaisado: { flexDirection: 'row' },
  columnaPortada: { width: '38%', maxWidth: 360, justifyContent: 'center', alignItems: 'center' },
  columna: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  contenido: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  contenidoEstrecho: { paddingHorizontal: 10, gap: 12 },
  portada: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },
  capituloFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  capitulo: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.xl,
    textAlign: 'center',
    flexShrink: 1,
    // E9: cifras de caja alta, que el «1» de «Capítulo 1» no parezca una «ı».
    fontVariant: ['lining-nums'],
  },
  autor: {
    fontFamily: fuentes.tituloCursiva,
    fontSize: fontSize.lg,
    textAlign: 'center',
    fontVariant: ['lining-nums'],
  },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  nota: { fontFamily: fuentes.ui, fontSize: fontSize.xs, textAlign: 'center' },
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
  barra: { borderTopWidth: 1, paddingTop: 4, paddingBottom: 8, paddingHorizontal: 8 },
  barraDentro: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  sobreBarra: { position: 'absolute', left: 8, right: 8, bottom: '100%', marginBottom: 8, zIndex: 5 },
  rielQuieto: { height: 44, justifyContent: 'center' },
  riel: { height: 6, borderRadius: 3 },
  avance: { gap: 0 },
  tiempos: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  tiempo: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acordeon: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  voz: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  vozNombre: { flex: 1, minHeight: 48, justifyContent: 'center' },
  vozTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
})

export default ReproductorScreen
