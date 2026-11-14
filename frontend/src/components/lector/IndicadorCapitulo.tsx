import React from 'react'

import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import {
  PosicionCapitulo,
  TramoCapitulo,
  etiquetaIndicador,
  porcentajeCapitulo,
  textoIndicador,
} from '@componentes/lector/capitulos'
import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { textoQuedan } from '@componentes/lector/folio'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { fontSize, fuentes } from '@tema'
import { reducirMovimiento, web } from '@tema/web'

/*
 * DÓNDE VAS EN EL CAPÍTULO (petición de Anderson). Dos piezas:
 *   · IndicadorCapitulo: la pastilla discreta del pie, SIEMPRE a la vista
 *     mientras la barra está escondida, en Pasar páginas y en Hojas:
 *     «Capítulo 7 · 45 % · quedan 6 min» con un hilo de latón que se llena.
 *     Tocarla abre el índice.
 *   · FilaCapitulo: la misma información, ampliada, en la barra de abajo
 *     cuando se muestra, con ‹ capítulo anterior / capítulo siguiente ›.
 */

interface Papel {
  fondo: string
  tinta: string
}

/** #RRGGBB → rgba con transparencia (para que la pastilla deje intuir el papel en Hojas). */
export function conAlfa(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`
}

/** El hilo de latón: oscuro en los papeles claros (contraste 3:1 de un elemento gráfico). */
const colorHilo = (papel: Papel) => (esOscuro(papel.fondo) ? SALA_ESCUCHA.laton : SALA_ESCUCHA.latonOscuro)

function esOscuro(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128
}

const Hilo: React.FC<{ avance: number; papel: Papel; testID?: string }> = ({ avance, papel, testID }) => (
  <View style={[styles.hilo, { backgroundColor: conAlfa(papel.tinta, 0.16) }]} testID={testID}>
    <View
      style={[
        styles.hiloLleno,
        { backgroundColor: colorHilo(papel), width: `${Math.round(Math.max(0, Math.min(1, avance)) * 1000) / 10}%` },
        web(reducirMovimiento() ? {} : { transition: 'width 320ms ease' }),
      ]}
    />
  </View>
)

interface PropsIndicador {
  pos: PosicionCapitulo | null
  minutos: number | null
  fraccionLibro: number
  papel: Papel
  /** false mientras la barra de abajo (que dice lo mismo) está a la vista. */
  visible: boolean
  /** Cuánto subirlo sobre el borde (mini reproductor), sin contar la zona segura. */
  abajo: number
  onPress: () => void
}

const IndicadorCapitulo: React.FC<PropsIndicador> = ({
  pos,
  minutos,
  fraccionLibro,
  papel,
  visible,
  abajo,
  onPress,
}) => {
  const { titulo, detalle } = textoIndicador(pos, minutos, fraccionLibro)
  const avance = pos ? pos.avance : fraccionLibro
  return (
    <View
      pointerEvents="box-none"
      aria-hidden={!visible}
      style={[
        styles.capa,
        web({
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(${abajo + 6}px + env(safe-area-inset-bottom))`,
          opacity: visible ? 1 : 0,
          ...(reducirMovimiento() ? {} : { transition: 'opacity 220ms ease' }),
        }),
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!visible}
        accessibilityRole="button"
        accessibilityLabel={etiquetaIndicador(pos, minutos, fraccionLibro)}
        testID="indicador-capitulo"
        style={({ pressed }) => [
          styles.pastilla,
          {
            backgroundColor: conAlfa(papel.fondo, 0.96),
            borderColor: 'rgba(201,162,39,0.38)',
          },
          web({
            pointerEvents: visible ? 'auto' : 'none',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
          }),
          pressed && styles.presionado,
        ]}
      >
        <View style={styles.filaTexto}>
          <Text numberOfLines={1} style={[styles.titulo, { color: papel.tinta }]}>
            {titulo}
          </Text>
          <Text numberOfLines={1} style={[styles.detalle, { color: papel.tinta }]}>
            {` · ${detalle}`}
          </Text>
        </View>
        <Hilo avance={avance} papel={papel} testID="hilo-capitulo" />
      </Pressable>
    </View>
  )
}

interface PropsFila {
  pos: PosicionCapitulo | null
  minutos: number | null
  fraccionLibro: number
  pagina: number | null
  paginas: number | null
  /** En el teléfono no cabe la página: solo el avance del capítulo y lo que queda. */
  compacto?: boolean
  anterior: TramoCapitulo | null
  siguiente: TramoCapitulo | null
  papel: Papel
  onAnterior: () => void
  onSiguiente: () => void
  onIndice: () => void
}

/** La fila de arriba de la barra de abajo: ‹ capítulo · dónde vas (toca → índice) · capítulo ›. */
export const FilaCapitulo: React.FC<PropsFila> = ({
  pos,
  minutos,
  fraccionLibro,
  pagina,
  paginas,
  compacto,
  anterior,
  siguiente,
  papel,
  onAnterior,
  onSiguiente,
  onIndice,
}) => {
  const { titulo, detalle } = textoIndicador(pos, minutos, fraccionLibro)
  const avance = pos ? pos.avance : fraccionLibro
  /* E8: en 320 px «… % del capítulo · quedan N min» se cortaba; ahí basta el porcentaje (el título ya es el capítulo). */
  const estrecho = useWindowDimensions().width < 360
  const linea = [
    pos ? `${porcentajeCapitulo(pos.avance)} %${estrecho ? '' : ' del capítulo'}` : detalle,
    !compacto && pagina && paginas ? `p. ${pagina} de ${paginas}` : null,
    pos ? textoQuedan(minutos) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <View style={styles.fila} testID="fila-capitulo">
      <BotonIcono
        icono="anterior"
        etiqueta={anterior ? `Capítulo anterior: ${anterior.titulo}` : 'No hay capítulo anterior'}
        color={papel.tinta}
        disabled={!anterior}
        onPress={onAnterior}
        testID="capitulo-anterior"
      />
      <Pressable
        onPress={onIndice}
        accessibilityRole="button"
        accessibilityLabel={etiquetaIndicador(pos, minutos, fraccionLibro)}
        testID="fila-capitulo-indice"
        style={({ pressed }) => [styles.centro, web({ cursor: 'pointer' }), pressed && styles.presionado]}
      >
        <Text numberOfLines={1} style={[styles.tituloFila, { color: papel.tinta }]}>
          {titulo}
        </Text>
        <Text numberOfLines={1} style={[styles.detalle, styles.centrado, { color: papel.tinta }]}>
          {linea}
        </Text>
        <Hilo avance={avance} papel={papel} />
      </Pressable>
      <BotonIcono
        icono="siguiente"
        etiqueta={siguiente ? `Capítulo siguiente: ${siguiente.titulo}` : 'No hay capítulo siguiente'}
        color={papel.tinta}
        disabled={!siguiente}
        onPress={onSiguiente}
        testID="capitulo-siguiente"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  capa: { alignItems: 'center', zIndex: 19 },
  pastilla: {
    minHeight: 44,
    maxWidth: 360,
    minWidth: 180,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    gap: 5,
  },
  filaTexto: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', minWidth: 0 },
  titulo: { fontFamily: fuentes.uiSemi, fontSize: fontSize.xs, flexShrink: 1 },
  detalle: {
    fontFamily: fuentes.ui,
    fontSize: fontSize.xs,
    opacity: 0.82,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  hilo: { height: 3, borderRadius: 2, overflow: 'hidden', alignSelf: 'stretch' },
  hiloLleno: { height: 3, borderRadius: 2 },
  presionado: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  centro: { flex: 1, minHeight: 44, justifyContent: 'center', gap: 3, paddingHorizontal: 6, minWidth: 0 },
  centrado: { textAlign: 'center' },
  tituloFila: { fontFamily: fuentes.uiSemi, fontSize: fontSize.xs, textAlign: 'center' },
})

export default IndicadorCapitulo
