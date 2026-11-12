import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import { cuentaDeCarpeta } from '@logica/carpetas'
import { fontSize, fuentes, paleta } from '@tema'
import { SOMBRA } from '@tema/materiales'
import { web } from '@tema/web'
import type { CarpetaDTO } from '@tipos'

interface Props {
  carpeta: CarpetaDTO
  onAbrir: () => void
  onMenu: () => void
  /** En una búsqueda: dónde está ("Proyectos / 2026"). */
  ubicacion?: string | null
}

/** Cartulina kraft de carpeta colgante y su pestaña (texto en tinta: 8,9:1). */
export const KRAFT = '#D9BC85'
const KRAFT_OSCURO = '#C7A66A'

/*
 * UNA CARPETA DEL ARCHIVADOR: una carpeta colgante de cartulina kraft con su
 * pestaña arriba a la izquierda, como las de un cajón de archivo de verdad.
 * Toda la tarjeta abre la carpeta; el «⋯» de la derecha abre su menú
 * (renombrar, mover, borrar). Dos toques como mucho para cualquier cosa.
 */
const TarjetaCarpeta: React.FC<Props> = ({ carpeta, onAbrir, onMenu, ubicacion }) => {
  const cuenta = cuentaDeCarpeta(carpeta)
  return (
    <View style={styles.marco}>
      <View
        style={[styles.pestana, web({ backgroundImage: `linear-gradient(180deg, #E6CC98, ${KRAFT})` })]}
        aria-hidden
      />
      <Pressable
        onPress={onAbrir}
        accessibilityRole="button"
        accessibilityLabel={`Carpeta ${carpeta.nombre}, ${cuenta}${ubicacion ? `, en ${ubicacion}` : ''}. Abrir`}
        testID={`carpeta-${carpeta.id}`}
        style={({ pressed }) => [
          styles.cuerpo,
          web({
            backgroundImage: `linear-gradient(180deg, ${KRAFT} 0%, ${KRAFT_OSCURO} 100%)`,
            boxShadow: `inset 0 1px 0 rgba(255,245,220,0.6), ${SOMBRA[1]}`,
            cursor: 'pointer',
            transition: 'transform 120ms ease',
          }),
          pressed && { transform: [{ translateY: 1 }] },
        ]}
      >
        <View style={styles.textos}>
          <Text style={styles.nombre} numberOfLines={2}>
            {carpeta.nombre}
          </Text>
          <Text style={styles.cuenta} numberOfLines={1}>
            {ubicacion ? `${cuenta} · en ${ubicacion}` : cuenta}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`Más acciones de la carpeta ${carpeta.nombre}`}
        testID={`menu-carpeta-${carpeta.id}`}
        style={({ pressed }) => [styles.mas, pressed && { opacity: 0.7 }, web({ cursor: 'pointer' })]}
      >
        <Icono nombre="more" color={paleta.robleOscuro} tamano={22} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  marco: { paddingTop: 10, flexGrow: 1, flexBasis: 260, minWidth: 0 },
  pestana: {
    position: 'absolute',
    top: 0,
    left: 14,
    width: 84,
    height: 16,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: KRAFT,
  },
  cuerpo: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 56,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: KRAFT,
  },
  textos: { flex: 1, gap: 2 },
  nombre: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, color: paleta.robleOscuro },
  cuenta: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, color: '#4A2E1C' },
  mas: {
    position: 'absolute',
    right: 4,
    top: 10 + 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default TarjetaCarpeta
