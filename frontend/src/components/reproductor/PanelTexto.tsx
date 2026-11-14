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
import { Velo, useFocoInicial } from '@componentes/molecules/Hoja'
import { type FraseDeTexto, enParrafos, useFrasesCapitulo } from '@componentes/reproductor/useFrasesCapitulo'
import { useTheme } from '@contextos/ThemeContext'
import { motor } from '@contextos/VozContext'
import { fontSize, fuentes } from '@tema'
import { hoja as materialHoja } from '@tema/materiales'
import { reducirMovimiento, web } from '@tema/web'
import { ponerMarca, rectDePalabra } from '@utils/marcaPalabra'

/*
 * «VER TEXTO» MIENTRAS SE ESCUCHA (como los lectores en voz alta).
 *
 * Lo de siempre es la carátula y el capítulo; esto es una consulta puntual:
 * una hoja que sube desde abajo en el teléfono y, en tablet y PC, una ventana
 * CENTRADA y amplia (líneas de lectura cómoda, ~70 caracteres; antes era una
 * franja estrecha a la derecha, 2026-11-12), con el texto del capítulo y la
 * frase que suena resaltada.
 *
 *   · Sigue a la voz: la frase actual se centra con un desplazamiento suave
 *     (sin animación si el sistema pide reducir movimiento).
 *   · Si el usuario se desplaza a mano, deja de seguir y aparece «Volver a la
 *     frase actual», que la centra y vuelve a seguir.
 *   · Tocar una frase lleva la voz a esa frase.
 *   · La palabra que suena lleva una marca de latón que se DESLIZA de una a
 *     otra (F1; utils/marcaPalabra). Con «Reducir movimiento»,
 *     salta sin deslizarse.
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
  grande = false,
}: {
  frases: FraseDeTexto[]
  titulo: boolean
  indice: number
  actual: string | null
  colorTexto: string
  colorResalte: string
  onTocar: (id: string) => void
  onY: (indice: number, y: number) => void
  /** Tablet y PC: la letra un punto más grande. */
  grande?: boolean
}) {
  return (
    <View onLayout={(e: LayoutChangeEvent) => onY(indice, e.nativeEvent.layout.y)}>
      <Text
        style={[titulo ? styles.titulo : styles.texto, grande && !titulo && styles.textoGrande, { color: colorTexto }]}
      >
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
  const marca = useRef<View>(null)
  const altoVista = useRef(0)
  useFocoInicial(visible, 'panel-texto-titulo')

  /* F1: la marca de la palabra sigue al motor de voz (sin pasar por React: una palabra cada ~300 ms). */
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return
    return motor.suscribirFrase((ev) => {
      const m = marca.current as unknown as HTMLElement | null
      if (!m) return
      const el = ev.fraseId ? document.getElementById(idDom(ev.fraseId)) : null
      const padre = m.offsetParent as HTMLElement | null
      if (!el || !padre || !ev.palabra) return ponerMarca(m, null, false)
      ponerMarca(m, rectDePalabra(el, ev.palabra[0], ev.palabra[1], padre), !reducirMovimiento())
    })
  }, [visible, frases])
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
      {...({ 'aria-label': `Texto: ${titulo}` } as object)}
    >
      <View
        style={[
          styles.fondo,
          {
            backgroundColor: colors.velo,
            justifyContent: escritorio ? 'center' : 'flex-end',
            alignItems: escritorio ? 'center' : 'stretch',
          },
        ]}
      >
        <Velo onCerrar={onCerrar} testID="velo-texto" />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.panel,
            escritorio
              ? {
                  width: Math.min(820, width * 0.9),
                  height: Math.min(980, height * 0.9),
                  borderWidth: 2,
                  borderRadius: 18,
                }
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
                nativeID="panel-texto-titulo"
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
              contentContainerStyle={[styles.cuerpo, escritorio && styles.cuerpoAncho]}
              onLayout={(e) => {
                altoVista.current = e.nativeEvent.layout.height
              }}
              onContentSizeChange={alCambiarContenido}
              onScroll={alDesplazar}
              onScrollBeginDrag={alArrastrar}
              scrollEventThrottle={64}
              testID="panel-texto-scroll"
            >
              <View
                ref={marca}
                pointerEvents="none"
                aria-hidden
                testID="marca-palabra"
                style={[
                  styles.marca,
                  { backgroundColor: 'rgba(201,162,39,0.32)' },
                  web({ opacity: 0, boxShadow: `inset 0 -2px 0 ${SALA_ESCUCHA.laton}`, willChange: 'transform' }),
                ]}
              />
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
                  grande={escritorio}
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
  cabeceraTitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, fontVariant: ['lining-nums'] },
  ayuda: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  scroll: { flex: 1 },
  cuerpo: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 120, gap: 14 },
  /* En tablet y PC: márgenes de libro y el texto un punto más grande. */
  cuerpoAncho: { paddingHorizontal: 48, paddingTop: 20, gap: 16 },
  texto: { fontFamily: fuentes.lectura, fontSize: fontSize.md, lineHeight: 30 },
  textoGrande: { fontSize: 20, lineHeight: 34 },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, lineHeight: 30, marginTop: 6 },
  actual: { borderRadius: 4 },
  /* La marca de la palabra: encima del texto, translúcida, y sin recibir toques. */
  marca: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderRadius: 5, zIndex: 2, opacity: 0 },
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
