import React, { useState } from 'react'

import { Image, StyleSheet, Text, View } from 'react-native'

import PortadaGenerada from '@componentes/estanteria/PortadaGenerada'
import { useTheme } from '@contextos/ThemeContext'
import { seEstaPreparando } from '@logica/formato'
import { urlPortada } from '@servicios/archivos'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  libro: EjemplarDTO
  ancho: number
  /** Alto; por defecto proporción 2:3. */
  alto?: number
  sombra?: boolean
}

/*
 * La portada de un libro: la imagen real si la hay (y si carga); si no, la
 * tipográfica en cuero. Un deseo se ve como un libro "por venir" (velado y con
 * borde punteado) y uno que el taller aún prepara, con su cinta "preparando…".
 */
const Portada: React.FC<Props> = ({ libro, ancho, alto, sombra = true }) => {
  const { colors } = useTheme()
  const [fallo, setFallo] = useState(false)
  const h = alto ?? Math.round(ancho * 1.5)
  const conImagen = libro.tienePortada && !!libro.archivoId && !fallo
  const preparando = seEstaPreparando(libro)
  return (
    <View
      style={[
        { width: ancho, height: h, borderRadius: 3, overflow: 'hidden' },
        sombra && web({ boxShadow: '0 1px 1px rgba(0,0,0,0.3), 0 10px 22px rgba(0,0,0,0.45)' }),
        libro.tipo === 'DESEO' && {
          opacity: 0.72,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.primaryLight,
        },
      ]}
    >
      {conImagen ? (
        <Image
          source={{ uri: urlPortada(libro.archivoId as string) }}
          style={{ width: ancho, height: h }}
          resizeMode="cover"
          onError={() => setFallo(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <PortadaGenerada libro={libro} ancho={ancho} alto={h} />
      )}
      {/* El canto del lomo: una sombra a la izquierda que hace que parezca un libro y no una foto. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          web({
            backgroundImage:
              'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(255,255,255,0.12) 3%, rgba(0,0,0,0.1) 6%, rgba(0,0,0,0) 12%)',
          }),
        ]}
      />
      {preparando ? (
        <View style={[styles.cinta, { backgroundColor: colors.velo }]}>
          <Text style={[styles.cintaTexto, { color: colors.text }]}>preparando…</Text>
        </View>
      ) : null}
      {libro.estadoConversion === 'ERROR' ? (
        <View style={[styles.cinta, { backgroundColor: colors.velo }]}>
          <Text style={[styles.cintaTexto, { color: colors.danger }]}>⚠ no se pudo preparar</Text>
        </View>
      ) : null}
      {libro.tipo === 'DESEO' ? (
        <View style={[styles.cinta, { backgroundColor: colors.velo }]}>
          <Text style={[styles.cintaTexto, { color: colors.primary }]}>☆ deseo</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  cinta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, alignItems: 'center' },
  cintaTexto: { fontSize: fontSize.xs, fontFamily: fuentes.uiMedia, letterSpacing: 0.4 },
})

export default Portada
