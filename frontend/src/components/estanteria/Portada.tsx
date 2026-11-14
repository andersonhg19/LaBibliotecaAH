import React, { useState } from 'react'

import { Image, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import PortadaGenerada from '@componentes/estanteria/PortadaGenerada'
import { useTheme } from '@contextos/ThemeContext'
import { seEstaPreparando } from '@logica/formato'
import { colorLomo, doradoLomo } from '@logica/lomos'
import { urlPortada } from '@servicios/archivos'
import { fontSize, fuentes } from '@tema'
import { cuero } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'
import '@utils/vuelo'

interface Props {
  libro: EjemplarDTO
  ancho: number
  /** Alto; por defecto proporción 2:3. */
  alto?: number
  sombra?: boolean
}

/**
 * ¿La "portada" es en realidad la primera página? (UX-09) En los PDF, Word y
 * texto la miniatura es un folio blanco con letra diminuta: se viste dentro de
 * una tapa de cuero. Las portadas de EPUB son portadas de verdad y van tal cual.
 */
export const portadaEsPagina = (l: Pick<EjemplarDTO, 'formatoOriginal' | 'tipo'>) =>
  l.tipo === 'DOCUMENTO' || (!!l.formatoOriginal && l.formatoOriginal !== 'EPUB')

/*
 * La portada de un libro: la imagen real si la hay (y si carga); si no, la
 * tipográfica en cuero. Un deseo se ve como un libro "por venir" (velado, con
 * borde punteado y su lazo) y uno que el taller aún prepara, con su cinta
 * "preparando…".
 */
const Portada: React.FC<Props> = ({ libro, ancho, alto, sombra = true }) => {
  const { colors } = useTheme()
  const [fallo, setFallo] = useState(false)
  const h = alto ?? Math.round(ancho * 1.5)
  const conImagen = libro.tienePortada && !!libro.archivoId && !fallo
  const vestida = conImagen && portadaEsPagina(libro)
  const preparando = seEstaPreparando(libro)
  const imagen = (w: number, alto2: number) => (
    <Image
      source={{ uri: urlPortada(libro.archivoId as string) }}
      style={{ width: w, height: alto2 }}
      resizeMode="cover"
      onError={() => setFallo(true)}
      accessibilityIgnoresInvertColors
    />
  )
  return (
    <View
      /* F2: la marca para que la tapa vuele hasta la ficha (utils/vuelo). */
      {...({ dataSet: { portada: libro.id } } as object)}
      style={[
        /* Esquinas un punto gastadas: la del lomo casi recta, las del canto más redondas. */
        {
          width: ancho,
          height: h,
          borderTopLeftRadius: 2,
          borderBottomLeftRadius: 2,
          borderTopRightRadius: 5,
          borderBottomRightRadius: 4,
          overflow: 'hidden',
        },
        sombra && web({ boxShadow: '0 1px 1px rgba(0,0,0,0.3), 0 10px 22px rgba(0,0,0,0.45)' }),
        libro.tipo === 'DESEO' && {
          opacity: 0.78,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.primaryLight,
        },
      ]}
    >
      {vestida ? (
        <TapaConLamina libro={libro} ancho={ancho} alto={h}>
          {imagen(Math.round(ancho * 0.7), Math.round(h * 0.56))}
        </TapaConLamina>
      ) : conImagen ? (
        imagen(ancho, h)
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
              'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(255,255,255,0.12) 3%, rgba(0,0,0,0.1) 6%, rgba(0,0,0,0) 12%), linear-gradient(125deg, rgba(255,250,235,0.16) 0%, rgba(255,250,235,0) 32%), radial-gradient(ellipse at 100% 100%, rgba(0,0,0,0.28), rgba(0,0,0,0) 45%)',
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
        <View style={[styles.cinta, styles.cintaDeseo, { backgroundColor: colors.velo }]}>
          <Icono nombre="deseo" color={colors.primary} tamano={16} />
          <Text style={[styles.cintaTexto, { color: colors.primary }]}>deseo</Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Una tapa de cuero con la primera página pegada como lámina, un filete
 * dorado alrededor y el título grabado debajo: así un PDF se ve como un libro
 * de la casa y no como un folio suelto.
 */
const TapaConLamina: React.FC<{ libro: EjemplarDTO; ancho: number; alto: number; children: React.ReactNode }> = ({
  libro,
  ancho,
  alto,
  children,
}) => {
  const base = colorLomo(libro)
  const oro = doradoLomo(libro)
  const tam = Math.max(14, Math.round(ancho * 0.1))
  return (
    <View
      accessible={false}
      style={[
        styles.tapa,
        { width: ancho, height: alto, backgroundColor: base, paddingTop: alto * 0.08 },
        web({ backgroundImage: cuero(base), boxShadow: 'inset 6px 0 10px rgba(0,0,0,0.45)' }),
      ]}
    >
      <View
        style={[
          styles.lamina,
          { borderColor: oro, padding: Math.max(2, ancho * 0.02) },
          web({ boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }),
        ]}
      >
        {children}
      </View>
      <Text
        numberOfLines={3}
        style={[
          styles.tituloTapa,
          { color: oro, fontSize: tam, lineHeight: Math.round(tam * 1.15), paddingHorizontal: ancho * 0.08 },
          web({ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }),
        ]}
      >
        {libro.titulo}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cinta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, alignItems: 'center' },
  cintaDeseo: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  cintaTexto: { fontSize: fontSize.xs, fontFamily: fuentes.uiMedia, letterSpacing: 0.4 },
  tapa: { alignItems: 'center', overflow: 'hidden', gap: 8 },
  lamina: { borderWidth: 1.5, backgroundColor: '#FBF7EE' },
  tituloTapa: { fontFamily: fuentes.tituloNegrita, textAlign: 'center' },
})

export default Portada
