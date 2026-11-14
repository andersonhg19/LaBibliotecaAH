import React, { useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Placa from '@componentes/atoms/Placa'
import LibroEnEstante from '@componentes/estanteria/LibroEnEstante'
import { useTheme } from '@contextos/ThemeContext'
import { plural, tiempoRestante } from '@logica/formato'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { fibraPapel, tablaEstante } from '@tema/madera'
import { SOMBRA } from '@tema/materiales'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  libros: EjemplarDTO[]
  onAbrir: (l: EjemplarDTO) => void
  /** Vacío: "Elegir un libro" (abre el catálogo en Por leer). */
  onElegir: () => void
  anchoPortada?: number
  /** En el PC: la tarjeta «Sigue donde lo dejaste» al lado del atril (llena la balda con algo útil). */
  onSeguir?: (l: EjemplarDTO) => void
  /** «+N»: los que no caben junto a la tarjeta, en la pestaña Leyendo. */
  onVerTodos?: () => void
}

/*
 * "LEYENDO AHORA" COMO UN ATRIL (plan de diseño B). Los libros abiertos de
 * frente, apoyados en un atril de nogal ligeramente inclinado, con una CINTA
 * BURDEOS de marcapáginas que asoma por abajo: cuanto más has leído, más
 * cinta. Debajo, el % y lo que queda. Vacío, el atril se pliega a una sola
 * línea con un botón: antes era un hueco de 230 px con un texto en cursiva.
 */
/** Medidas del atril junto a la tarjeta (PC). */
export const ATRIL = { tarjeta: 330, separacion: 28, margen: 14, hueco: 6, extraPuesto: 28 } as const

/**
 * Cuántos libros caben en el atril SIN tocar la tarjeta «Sigue donde lo
 * dejaste» (que reserva su ancho), y cuántos quedan para «+N». Con todos
 * dentro, el grupo va centrado; si no caben, el último hueco es «+N», que
 * lleva a la pestaña Leyendo. Devuelve también dónde cae cada cosa (para medir).
 */
export function repartoAtril(ancho: number, n: number, anchoPortada: number) {
  const puesto = anchoPortada + ATRIL.extraPuesto
  const util = ancho - ATRIL.margen * 2 - ATRIL.tarjeta - ATRIL.separacion - ATRIL.margen * 2
  const caben = Math.max(1, Math.floor((util + ATRIL.hueco) / (puesto + ATRIL.hueco)))
  const visibles = n <= caben ? n : Math.max(0, caben - 1)
  const resto = n - visibles
  const huecos = visibles + (resto ? 1 : 0)
  const anchoLibros = ATRIL.margen * 2 + huecos * puesto + Math.max(0, huecos - 1) * ATRIL.hueco
  const total = anchoLibros + ATRIL.separacion + ATRIL.tarjeta
  const inicio = Math.max(ATRIL.margen, (ancho - total) / 2)
  const libros = Array.from({ length: huecos }, (_, i) => {
    const x = inicio + ATRIL.margen + i * (puesto + ATRIL.hueco)
    return { x, ancho: puesto }
  })
  const tarjeta = { x: inicio + anchoLibros + ATRIL.separacion, ancho: ATRIL.tarjeta }
  return { visibles, resto, libros, tarjeta, anchoLibros }
}

const Atril: React.FC<Props> = ({ libros, onAbrir, onElegir, anchoPortada = 112, onSeguir, onVerTodos }) => {
  const { colors, isDark } = useTheme()
  const [ancho, setAncho] = useState(0)
  /* En el PC (con tarjeta) solo van los que caben; el resto, en «+N». En el teléfono, la fila se desliza. */
  const reparto = onSeguir && ancho ? repartoAtril(ancho, libros.length, anchoPortada) : null
  const enAtril = reparto ? libros.slice(0, reparto.visibles) : libros
  /* Sobre el fondo del mueble: pergamino de noche, roble oscuro de día (madera clara). */
  const tinta = isDark ? colors.text : paleta.robleOscuro

  if (!libros.length) {
    return (
      <View style={styles.vacio} testID="estante-leyendo">
        <Placa titulo="Leyendo ahora" />
        <Text style={[styles.vacioTexto, { color: tinta }, !isDark && styles.sobrePapel]}>
          Nada en el atril todavía.
        </Text>
        <Button title="Elegir un libro" icono="book" size="small" variant="secondary" onPress={onElegir} />
      </View>
    )
  }

  return (
    <View testID="estante-leyendo" style={styles.atril}>
      <View style={styles.cabecera}>
        <Placa titulo="Leyendo ahora" detalle={plural(libros.length, 'libro')} />
      </View>
      <View
        style={[styles.cuerpo, onSeguir && styles.cuerpoJunto]}
        onLayout={(e) => setAncho(Math.round(e.nativeEvent.layout.width))}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={onSeguir ? styles.libros : undefined}
          contentContainerStyle={styles.fila}
          scrollEnabled={!onSeguir}
          testID="atril-libros"
        >
          {enAtril.map((l, i) => {
            const p = Math.max(0, Math.min(100, l.porcentaje || 0))
            const queda = tiempoRestante(l.minutosEstimados, p)
            return (
              <View key={l.id} style={[styles.puesto, { width: anchoPortada + 28 }]}>
                <View style={[styles.inclinado, web({ transform: 'perspective(700px) rotateX(7deg)' })]}>
                  <LibroEnEstante
                    libro={l}
                    modo="portada"
                    anchoPortada={anchoPortada}
                    onAbrir={onAbrir}
                    colorFijo={null}
                    estanteId="leyendo"
                    indice={i}
                    total={libros.length}
                  />
                  {/* La cinta de marcapáginas: asoma más cuanto más llevas. */}
                  <View
                    accessible={false}
                    pointerEvents="none"
                    style={[
                      styles.cinta,
                      { height: 18 + Math.round(34 * (p / 100)), backgroundColor: paleta.burdeos },
                      web({
                        backgroundImage:
                          'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(255,255,255,0.12) 45%, rgba(0,0,0,0.3))',
                        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
                        boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
                      }),
                    ]}
                  />
                </View>
                <Text
                  style={[styles.cifra, { color: tinta }, !isDark && styles.sobrePapel]}
                  accessibilityLabel={`${l.titulo}: vas por el ${Math.round(p)} %${queda ? `, ${queda}` : ''}`}
                >
                  <Text style={styles.cifraFuerte}>{Math.round(p)} %</Text>
                  {queda ? `\n${queda}` : ''}
                </Text>
              </View>
            )
          })}
          {reparto?.resto ? (
            <Pressable
              onPress={onVerTodos ?? onElegir}
              accessibilityRole="button"
              accessibilityLabel={`Ver los ${libros.length} libros que estás leyendo`}
              testID="atril-mas"
              style={({ pressed }) => [
                styles.mas,
                { width: anchoPortada + ATRIL.extraPuesto, borderColor: colors.primaryLight },
                web({
                  backgroundImage: 'linear-gradient(180deg, rgba(255,240,200,0.10), rgba(0,0,0,0.18))',
                  cursor: 'pointer',
                }),
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.masCifra, { color: tinta }, !isDark && styles.sobrePapel]}>+{reparto.resto}</Text>
              <Text style={[styles.masTexto, { color: tinta }, !isDark && styles.sobrePapel]}>Ver todos ›</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        {onSeguir ? <SigueLeyendo libro={libros[0]} onSeguir={onSeguir} onAbrir={onAbrir} /> : null}
      </View>
      {/* El reborde del atril, donde se apoyan los libros. */}
      <View
        accessible={false}
        style={[
          styles.reborde,
          { backgroundColor: isDark ? '#5A3820' : '#A87440' },
          web({
            backgroundImage: tablaEstante(isDark),
            boxShadow: '0 10px 14px -4px rgba(10,5,2,0.7), inset 0 1px 0 rgba(255,220,170,0.4)',
          }),
        ]}
      />
    </View>
  )
}

/**
 * «SIGUE DONDE LO DEJASTE»: en el PC, la balda del atril ya no queda vacía a la
 * derecha. Una tarjeta de pergamino con el último libro abierto, cuánto llevas
 * y lo que queda, y UNA acción principal: seguir leyendo.
 */
const SigueLeyendo: React.FC<{
  libro: EjemplarDTO
  onSeguir: (l: EjemplarDTO) => void
  onAbrir: (l: EjemplarDTO) => void
}> = ({ libro, onSeguir, onAbrir }) => {
  const p = Math.round(Math.max(0, Math.min(100, libro.porcentaje || 0)))
  const queda = tiempoRestante(libro.minutosEstimados, p)
  return (
    <View
      testID="sigue-leyendo"
      style={[
        styles.tarjeta,
        { backgroundColor: paleta.pergamino },
        web({
          backgroundImage: `${fibraPapel}, linear-gradient(180deg, ${paleta.marfil}, ${paleta.pergamino})`,
          boxShadow: SOMBRA[2],
          transform: 'rotate(-0.6deg)',
        }),
      ]}
    >
      <Text style={styles.tarjetaRotulo}>Sigue donde lo dejaste</Text>
      <Text style={styles.tarjetaTitulo} numberOfLines={2}>
        {libro.titulo}
      </Text>
      {libro.autores?.length ? (
        <Text style={styles.tarjetaAutor} numberOfLines={1}>
          {libro.autores.join(', ')}
        </Text>
      ) : null}
      <View style={styles.tarjetaBarra}>
        <Barra porcentaje={p} alto={5} etiqueta={`Avance de ${libro.titulo}`} color={paleta.burdeos} />
      </View>
      <Text style={styles.tarjetaMeta}>
        Vas por el {p} %{queda ? ` · ${queda}` : ''}
      </Text>
      <View style={styles.tarjetaBotones}>
        <Button title="Seguir leyendo" icono="libroAbierto" size="small" onPress={() => onSeguir(libro)} />
        <Button title="Ficha" size="small" variant="secondary" onPress={() => onAbrir(libro)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  atril: { marginBottom: 22 },
  cuerpo: { flexDirection: 'row', alignItems: 'flex-end' },
  /* En el PC (QA diseño 2): los libros y la tarjeta juntos, centrados bajo la lámpara, sin 650 px vacíos en medio. */
  cuerpoJunto: { justifyContent: 'center', gap: ATRIL.separacion, paddingHorizontal: ATRIL.margen },
  mas: {
    alignSelf: 'center',
    minHeight: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  /* UX5-03: de día, la tinta sobre la madera clara se quedaba en ~2,9:1; con una placa de papel, > 12:1. */
  sobrePapel: { backgroundColor: 'rgba(251,247,238,0.92)', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  masCifra: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.xxl, fontVariant: ['lining-nums'] },
  masTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  libros: { flexGrow: 0, flexShrink: 1 },
  tarjeta: { width: 330, borderRadius: 4, padding: 18, gap: 6, marginBottom: 22 },
  tarjetaRotulo: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.sm, color: paleta.roble },
  tarjetaTitulo: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.xl,
    color: paleta.robleOscuro,
    lineHeight: 30,
  },
  tarjetaAutor: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md, color: paleta.nogal },
  tarjetaBarra: { marginTop: 6 },
  tarjetaMeta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, color: paleta.nogal, fontVariant: ['lining-nums'] },
  tarjetaBotones: { flexDirection: 'row', gap: 8, marginTop: 6 },
  cabecera: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 8, marginBottom: 6 },
  fila: { paddingHorizontal: 14, paddingTop: 10, gap: 6, alignItems: 'flex-end' },
  puesto: { alignItems: 'center', paddingBottom: 6 },
  inclinado: { alignItems: 'center' },
  cinta: { position: 'absolute', bottom: -12, right: '28%', width: 11 },
  cifra: {
    fontFamily: fuentes.uiMedia,
    fontSize: fontSize.xs,
    marginTop: 22,
    textAlign: 'center',
    fontVariant: ['lining-nums', 'tabular-nums'],
  },
  cifraFuerte: { fontFamily: fuentes.uiSemi },
  reborde: { height: 14, marginHorizontal: 4, borderRadius: 2 },
  vacio: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  vacioTexto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
})

export default Atril
