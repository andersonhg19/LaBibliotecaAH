import React, { useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Chip from '@componentes/atoms/Chip'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { type LugarEnIndice, type RegionCapitulo, estructurarIndice, normalizarTitulo } from '@logica/capitulos'
import { duracion } from '@logica/formato'
import { idDeFrase } from '@logica/tiempos'
import { capitulosVozService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { CapituloResumen, EjemplarDetalleDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { mensajeDelServidor } from '@utils/mensajes'

/*
 * EL ÍNDICE DE LA FICHA (0.4.0, casos C13 y E12). Agrupado como un libro de
 * verdad: «Antes de empezar» (portadilla, créditos, dedicatoria, prólogo sin
 * número), «Capítulos» (con las partes como cabeceras) y «Al final» (notas,
 * agradecimientos, sobre la autora…). Si el libro no tiene ni antes ni final,
 * no hay cabeceras: la lista de siempre.
 *
 * Con el servidor 0.4.0 cada capítulo dice si entra en el audiolibro (enVoz):
 * el interruptor 🎧 lo cambia para ESTE usuario y el chip «Solo la historia»
 * deja en la voz solo el cuerpo del libro. Escuchando de corrido se saltan los
 * apagados; tocar ▶ en uno apagado lo lee igual (elegido a mano).
 */

export const GRUPOS: { region: RegionCapitulo; titulo: string }[] = [
  { region: 'antes', titulo: 'Antes de empezar' },
  { region: 'cuerpo', titulo: 'Capítulos' },
  { region: 'despues', titulo: 'Al final' },
]

const NO_DISPONIBLE = 'Tu casa todavía no tiene esta opción: llegará con la próxima versión del servidor.'
const sinRuta = (e: unknown) => {
  const st = (e as { response?: { status?: number } } | null)?.response?.status
  return st === 404 || st === 405
}

/** ¿Están en la voz exactamente los capítulos del cuerpo? */
export function esSoloHistoria(capitulos: readonly CapituloResumen[], lugares: readonly LugarEnIndice[]): boolean {
  return capitulos.length > 0 && capitulos.every((c, i) => (c.enVoz !== false) === (lugares[i]?.region === 'cuerpo'))
}

const PORTADILLA = /^(portadilla|portada|cubierta|anteportada|title\s*page)/i

/** Cómo se llama una fila sin número, para el lector de pantalla («la portadilla», «la parte»…). */
const nombreDe = (l: LugarEnIndice, titulo: string, tituloLibro: string): string => {
  if (l.numero != null) return `el capítulo ${l.numero}`
  if (l.parte) return 'la parte'
  if (l.region === 'despues') return 'la sección del final'
  const portadilla = PORTADILLA.test(titulo.trim()) || normalizarTitulo(titulo) === normalizarTitulo(tituloLibro)
  return l.region === 'antes' && portadilla ? 'la portadilla' : 'la sección'
}

interface Props {
  libro: EjemplarDetalleDTO
  legible: boolean
  onLeer: (frase?: string) => void
  onEscuchar: (frase?: string) => void
  /** Los capítulos con el enVoz nuevo (ya guardado o en vuelo). */
  onCapitulos: (c: CapituloResumen[]) => void
  /** Volver a pedir el libro (tras «Solo la historia»). */
  onRecargar: () => void
}

const IndiceLibro: React.FC<Props> = ({ libro, legible, onLeer, onEscuchar, onCapitulos, onRecargar }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [ocupado, setOcupado] = useState<number | 'todos' | null>(null)
  const caps = libro.capitulos
  const lugares = estructurarIndice(caps, libro.titulo)
  const conVoz = caps.some((c) => typeof c.enVoz === 'boolean')
  const hayGrupos = lugares.some((l) => l.region !== 'cuerpo')
  const soloHistoria = conVoz && esSoloHistoria(caps, lugares)

  const cambiarVoz = async (c: CapituloResumen) => {
    if (ocupado != null) return
    const antes = caps
    const nuevo = !(c.enVoz !== false)
    setOcupado(c.indice)
    onCapitulos(caps.map((x) => (x.indice === c.indice ? { ...x, enVoz: nuevo } : x)))
    try {
      const r = await capitulosVozService.cambiar(libro.id, c.indice, nuevo)
      if (!r.correct) throw new Error(r.message)
      if (r.object) onCapitulos(antes.map((x) => (x.indice === c.indice ? { ...x, ...r.object, enVoz: nuevo } : x)))
    } catch (e) {
      onCapitulos(antes)
      showToast(
        'error',
        'No se pudo cambiar',
        sinRuta(e) ? NO_DISPONIBLE : mensajeDelServidor(e, 'Inténtalo otra vez.'),
      )
    } finally {
      setOcupado(null)
    }
  }

  const alternarSoloHistoria = async () => {
    if (ocupado != null) return
    const antes = caps
    const activar = !soloHistoria
    setOcupado('todos')
    if (activar) onCapitulos(caps.map((x, i) => ({ ...x, enVoz: lugares[i].region === 'cuerpo' })))
    try {
      const r = await capitulosVozService.soloHistoria(libro.id, activar)
      if (!r.correct) throw new Error(r.message)
      showToast('success', activar ? 'En la voz, solo la historia.' : 'La voz vuelve a lo que decide la casa.')
      onRecargar()
    } catch (e) {
      onCapitulos(antes)
      showToast(
        'error',
        'No se pudo cambiar',
        sinRuta(e) ? NO_DISPONIBLE : mensajeDelServidor(e, 'Inténtalo otra vez.'),
      )
    } finally {
      setOcupado(null)
    }
  }

  const fila = (c: CapituloResumen, l: LugarEnIndice) => {
    const actual = libro.progreso?.capitulo === c.indice
    const nombre = nombreDe(l, c.titulo, libro.titulo)
    const enVoz = c.enVoz !== false
    if (l.parte) {
      return (
        <Pressable
          key={c.indice}
          onPress={() => legible && onLeer(idDeFrase(c.indice, 0))}
          accessibilityRole="button"
          accessibilityLabel={`Leer ${nombre}: ${c.titulo}`}
          style={[styles.parte, { borderBottomColor: colors.border }, web({ cursor: 'pointer' })]}
          testID={`indice-parte-${c.indice}`}
        >
          <Text style={[styles.parteTexto, { color: colors.text }]} numberOfLines={2}>
            {c.titulo}
          </Text>
        </Pressable>
      )
    }
    return (
      <View key={c.indice} style={[styles.capitulo, { borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.capituloTexto}
          onPress={() => legible && onLeer(idDeFrase(c.indice, 0))}
          accessibilityRole="button"
          accessibilityLabel={`Leer ${nombre}: ${c.titulo}${actual ? ', vas por aquí' : ''}`}
        >
          {l.numero == null ? (
            // Lo que no es un capítulo no se numera (UX-30): un rombo de latón en su lugar.
            <View style={styles.capNum} accessible={false}>
              <View style={[styles.rombo, { backgroundColor: colors.primaryLight }]} />
            </View>
          ) : (
            <Text style={[styles.capNum, { color: colors.primaryLight }]} accessible={false}>
              {String(l.numero).padStart(2, '0')}
            </Text>
          )}
          <Text
            style={[styles.capTitulo, { color: enVoz || !conVoz ? colors.text : colors.textSecondary }]}
            numberOfLines={2}
          >
            {c.titulo}
            {actual ? '  ◂ vas aquí' : ''}
          </Text>
          <Text style={[styles.capMin, { color: colors.textMuted }]}>{duracion(c.minutos)}</Text>
        </Pressable>
        {conVoz ? (
          <Pressable
            onPress={() => cambiarVoz(c)}
            disabled={ocupado != null}
            {...estadoElegible('switch', enVoz, ocupado != null)}
            accessibilityLabel={`En el audiolibro: ${c.titulo}`}
            testID={`envoz-${c.indice}`}
            style={({ pressed }) => [
              styles.interruptor,
              { borderColor: enVoz ? colors.primaryLight : colors.border },
              enVoz && { backgroundColor: colors.card },
              pressed && styles.presionado,
              web({ cursor: 'pointer' }),
            ]}
          >
            <View style={!enVoz && styles.apagado}>
              <Icono nombre="auriculares" color={enVoz ? colors.primary : colors.textMuted} tamano={18} />
            </View>
            {!enVoz ? <View style={[styles.tachon, { backgroundColor: colors.textMuted }]} /> : null}
          </Pressable>
        ) : null}
        <BotonIcono
          icono="play"
          etiqueta={`Escuchar ${nombre}`}
          onPress={() => legible && onEscuchar(idDeFrase(c.indice, 0))}
        />
      </View>
    )
  }

  return (
    <View testID="indice-libro">
      {conVoz ? (
        <View style={styles.cabeceraVoz}>
          <Chip
            etiqueta="Solo la historia"
            icono="auriculares"
            activo={soloHistoria}
            disabled={ocupado != null}
            onPress={alternarSoloHistoria}
            accessibilityLabel="Solo la historia en el audiolibro"
            testID="solo-historia"
          />
          <Text style={[styles.ayuda, { color: colors.textMuted }]}>
            🎧 = se lee en voz alta al escuchar de corrido.
          </Text>
        </View>
      ) : null}
      {GRUPOS.map((g) => {
        const filas = caps.map((c, i) => ({ c, l: lugares[i] })).filter((x) => x.l.region === g.region)
        if (!filas.length) return null
        return (
          <View key={g.region} testID={`grupo-${g.region}`}>
            {hayGrupos ? (
              <AppText variant="label" nivel={3} accessibilityRole="header" style={styles.grupo}>
                {g.titulo}
              </AppText>
            ) : null}
            {filas.map(({ c, l }) => fila(c, l))}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  cabeceraVoz: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  ayuda: { flex: 1, minWidth: 160, fontFamily: fuentes.ui, fontSize: fontSize.xs },
  grupo: {
    fontFamily: fuentes.uiSemi,
    fontWeight: '600',
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 4,
  },
  parte: { minHeight: 48, justifyContent: 'center', paddingTop: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  parteTexto: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.lg,
    letterSpacing: 0.6,
    fontVariant: ['lining-nums'],
  },
  capitulo: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  capituloTexto: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  capNum: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.lg,
    width: 34,
    fontVariant: ['lining-nums', 'tabular-nums'],
  },
  rombo: { width: 8, height: 8, marginLeft: 6, transform: [{ rotate: '45deg' }] },
  capTitulo: { flex: 1, fontFamily: fuentes.titulo, fontSize: fontSize.md, fontVariant: ['lining-nums'] },
  capMin: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  interruptor: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apagado: { opacity: 0.6 },
  tachon: { position: 'absolute', width: 26, height: 2, borderRadius: 1, transform: [{ rotate: '-40deg' }] },
  presionado: { opacity: 0.7 },
})

export default IndiceLibro
