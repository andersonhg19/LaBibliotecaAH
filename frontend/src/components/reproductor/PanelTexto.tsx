import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { type FraseDeTexto, enParrafos, useFrasesCapitulo } from '@componentes/reproductor/useFrasesCapitulo'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { hoja as materialHoja } from '@tema/materiales'
import { reducirMovimiento, web } from '@tema/web'

/*
 * «VER TEXTO» MIENTRAS SE ESCUCHA (como los lectores en voz alta).
 *
 * Lo de siempre es la carátula y el capítulo; esto es una consulta puntual:
 * una hoja que sube desde abajo en el teléfono y un panel a la derecha en el
 * PC, con el texto del capítulo y la frase que suena resaltada.
 *
 *   · Sigue a la voz: la frase actual se centra con un desplazamiento suave
 *     (sin animación si el sistema pide reducir movimiento).
 *   · Si el usuario se desplaza a mano, deja de seguir y aparece «Volver a la
 *     frase actual», que la centra y vuelve a seguir.
 *   · Tocar una frase lleva la voz a esa frase.
 *   · Se cierra con la ✕, tocando fuera o con Escape (web).
 */

export const TEXTOS_VER_TEXTO = {
  ayuda: 'Toca una frase para escucharla desde ahí.',
  volver: 'Volver a la frase actual',
  vacio: 'Este capítulo no tiene texto para leer en voz alta.',
}

/** Lo que tarda como mucho un desplazamiento suave: los eventos de scroll en ese rato son nuestros, no del usuario. */
const VENTANA_AUTO_MS = 1000
/** La frase actual queda un poco por encima del centro: se ve lo que viene. */
const ALTURA_OBJETIVO = 0.38

interface Props {
  visible: boolean
  onCerrar: () => void
  archivoId: string | null
  capitulo: number
  /** Título del capítulo (cabecera del panel). */
  titulo: string
  /** La frase que suena ahora (o null). */
  fraseId: string | null
  /** Tocar una frase: llevar la voz ahí. */
  onTocarFrase: (fraseId: string) => void
  /** Controles de sonido fijos abajo (pausar, saltar): el panel no los tapa en el teléfono. */
  pie?: React.ReactNode
  testID?: string
}

const idDom = (fraseId: string) => `bah-texto-${fraseId}`

/** Un párrafo; solo se vuelve a pintar si la frase que suena entra o sale de él. */
const Parrafo = React.memo(function Parrafo({
  frases,
  titulo,
  indice,
  actual,
  colorTexto,
  colorResalte,
  onTocar,
  onY,
}: {
  frases: FraseDeTexto[]
  titulo: boolean
  indice: number
  actual: string | null
  colorTexto: string
  colorResalte: string
  onTocar: (id: string) => void
  onY: (indice: number, y: number) => void
}) {
  return (
    <View onLayout={(e: LayoutChangeEvent) => onY(indice, e.nativeEvent.layout.y)}>
      <Text style={[titulo ? styles.titulo : styles.texto, { color: colorTexto }]}>
        {frases.map((f, k) => {
          const suena = f.id === actual
          return (
            <Text
              key={f.id}
              nativeID={idDom(f.id)}
              testID={`panel-frase-${f.id}`}
              onPress={() => onTocar(f.id)}
              accessibilityHint="Escuchar desde esta frase"
              aria-current={suena ? 'true' : undefined}
              style={[
                suena ? [styles.actual, { backgroundColor: colorResalte }] : null,
                web({ cursor: 'pointer', transition: 'background-color 200ms ease' }),
              ]}
            >
              {f.texto}
              {k < frases.length - 1 ? ' ' : ''}
            </Text>
          )
        })}
      </Text>
    </View>
  )
})

const PanelTexto: React.FC<Props> = ({
  visible,
  onCerrar,
  archivoId,
  capitulo,
  titulo,
  fraseId,
  onTocarFrase,
  pie,
  testID,
}) => {
  const { colors, isDark } = useTheme()
  const { width, height } = useWindowDimensions()
  const escritorio = width >= 820
  const { frases, cargando, error, reintentar } = useFrasesCapitulo(archivoId, capitulo, visible)
  const parrafos = useMemo(() => (frases ? enParrafos(frases) : []), [frases])
  const parrafoDe = useMemo(() => {
    const m = new Map<string, number>()
    parrafos.forEach((p, i) => p.frases.forEach((f) => m.set(f.id, i)))
    return m
  }, [parrafos])

  const scroll = useRef<ScrollView>(null)
  const altoVista = useRef(0)
  const yParrafos = useRef(new Map<number, number>())
  const ultimoAuto = useRef(0)
  const [siguiendo, setSiguiendo] = useState(true)
  const sigue = useRef(true)
  sigue.current = siguiendo

  // Al abrir (o cambiar de capítulo) se vuelve a seguir a la voz.
  useEffect(() => {
    if (visible) setSiguiendo(true)
  }, [visible, capitulo])

  /** Dónde está una frase dentro del contenido (px), o null si aún no se sabe. */
  const posicionDe = useCallback(
    (id: string): number | null => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const el = document.getElementById(idDom(id))
        const nodo = (
          scroll.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null
        )?.getScrollableNode?.()
        if (el && nodo) return el.getBoundingClientRect().top - nodo.getBoundingClientRect().top + nodo.scrollTop
      }
      const p = parrafoDe.get(id)
      return p == null ? null : (yParrafos.current.get(p) ?? null)
    },
    [parrafoDe],
  )

  const centrar = useCallback(
    (animado: boolean): boolean => {
      if (!fraseId) return false
      const y = posicionDe(fraseId)
      if (y == null || !scroll.current) return false
      ultimoAuto.current = Date.now()
      scroll.current.scrollTo({
        y: Math.max(0, y - (altoVista.current || height * 0.7) * ALTURA_OBJETIVO),
        animated: animado && !reducirMovimiento(),
      })
      return true
    },
    [fraseId, posicionDe, height],
  )

  // Recién cargado el texto, la frase actual se pone en su sitio sin animación.
  const centradoInicial = useRef(false)
  useEffect(() => {
    centradoInicial.current = false
  }, [visible, capitulo, frases])

  // Sigue a la voz: cada frase nueva se centra (si el usuario no se fue a otra parte).
  useEffect(() => {
    if (!visible || !siguiendo || !parrafos.length) return
    if (centrar(centradoInicial.current)) centradoInicial.current = true
  }, [visible, siguiendo, parrafos, centrar])

  const alCambiarContenido = useCallback(() => {
    if (centradoInicial.current || !sigue.current) return
    if (centrar(false)) centradoInicial.current = true
  }, [centrar])

  const onY = useCallback((i: number, y: number) => {
    yParrafos.current.set(i, y)
  }, [])

  const tocar = useCallback(
    (id: string) => {
      setSiguiendo(true)
      onTocarFrase(id)
    },
    [onTocarFrase],
  )

  const alDesplazar = () => {
    if (sigue.current && Date.now() - ultimoAuto.current > VENTANA_AUTO_MS) setSiguiendo(false)
  }
  const alArrastrar = () => {
    if (sigue.current) setSiguiendo(false)
  }
  const volver = () => {
    setSiguiendo(true)
    centrar(true)
  }

  const resalte = colors.vozFrase
  const fraseVisible = fraseId && parrafoDe.has(fraseId) ? fraseId : null

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducirMovimiento() ? 'none' : escritorio ? 'fade' : 'slide'}
      onRequestClose={onCerrar}
    >
      <View
        style={[
          styles.fondo,
          {
            backgroundColor: colors.velo,
            justifyContent: escritorio ? 'flex-start' : 'flex-end',
            alignItems: escritorio ? 'flex-end' : 'stretch',
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar el texto"
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.panel,
            escritorio
              ? { width: Math.min(480, width * 0.42), height: '100%', borderLeftWidth: 2 }
              : { height: height * 0.86, borderTopWidth: 2, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web(materialHoja(isDark, colors)),
          ]}
        >
          {!escritorio ? <View style={[styles.asa, { backgroundColor: colors.border }]} /> : null}
          <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
            <View style={styles.cabeceraTexto}>
              <Text
                style={[styles.cabeceraTitulo, { color: colors.text }]}
                numberOfLines={2}
                accessibilityRole="header"
              >
                {titulo}
              </Text>
              <Text style={[styles.ayuda, { color: colors.textMuted }]}>{TEXTOS_VER_TEXTO.ayuda}</Text>
            </View>
            <BotonIcono icono="close" etiqueta="Cerrar el texto" onPress={onCerrar} testID="cerrar-texto" />
          </View>

          {cargando ? (
            <View style={styles.centro}>
              <ActivityIndicator color={SALA_ESCUCHA.laton} />
            </View>
          ) : error ? (
            <View style={styles.centro} accessibilityLiveRegion="polite">
              <Text style={[styles.ayuda, { color: colors.danger }]}>⚠ {error}</Text>
              <Button title="Reintentar" icono="volver" size="small" onPress={reintentar} testID="reintentar-texto" />
            </View>
          ) : parrafos.length === 0 ? (
            <View style={styles.centro}>
              <Text style={[styles.ayuda, { color: colors.textMuted }]}>{TEXTOS_VER_TEXTO.vacio}</Text>
            </View>
          ) : (
            <ScrollView
              ref={scroll}
              style={styles.scroll}
              contentContainerStyle={styles.cuerpo}
              onLayout={(e) => {
                altoVista.current = e.nativeEvent.layout.height
              }}
              onContentSizeChange={alCambiarContenido}
              onScroll={alDesplazar}
              onScrollBeginDrag={alArrastrar}
              scrollEventThrottle={64}
              testID="panel-texto-scroll"
            >
              {parrafos.map((p, i) => (
                <Parrafo
                  key={p.frases[0].id}
                  frases={p.frases}
                  titulo={p.titulo}
                  indice={i}
                  actual={fraseVisible && parrafoDe.get(fraseVisible) === i ? fraseVisible : null}
                  colorTexto={colors.text}
                  colorResalte={resalte}
                  onTocar={tocar}
                  onY={onY}
                />
              ))}
            </ScrollView>
          )}

          {!siguiendo && fraseVisible ? (
            <View style={[styles.volverCaja, pie ? { bottom: 96 } : null]} pointerEvents="box-none">
              <Pressable
                onPress={volver}
                accessibilityRole="button"
                accessibilityLabel={TEXTOS_VER_TEXTO.volver}
                testID="volver-frase-actual"
                style={[
                  styles.volver,
                  { backgroundColor: colors.primary },
                  web({ cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }),
                ]}
              >
                <Icono nombre="down" color={isDark ? SALA_ESCUCHA.robleOscuro : '#FFFFFF'} tamano={16} />
                <Text style={[styles.volverTexto, { color: isDark ? SALA_ESCUCHA.robleOscuro : '#FFFFFF' }]}>
                  {TEXTOS_VER_TEXTO.volver}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {pie ? (
            <View
              style={[
                styles.pie,
                { borderTopColor: colors.border, backgroundColor: colors.surface },
                web({ paddingBottom: 'calc(6px + env(safe-area-inset-bottom))' }),
              ]}
              testID="panel-texto-controles"
            >
              {pie}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fondo: { flex: 1 },
  panel: { width: '100%', overflow: 'hidden' },
  asa: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  /* Un filete bajo la cabecera: el texto que se desplaza no se pega al título. */
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cabeceraTexto: { flex: 1, gap: 2 },
  cabeceraTitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg },
  ayuda: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  scroll: { flex: 1 },
  cuerpo: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 120, gap: 14 },
  texto: { fontFamily: fuentes.lectura, fontSize: fontSize.md, lineHeight: 30 },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, lineHeight: 30, marginTop: 6 },
  actual: { borderRadius: 4 },
  volverCaja: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center' },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  volverTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
})

export default React.memo(PanelTexto)
