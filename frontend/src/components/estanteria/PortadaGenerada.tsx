import React from 'react'

import { StyleSheet, Text, View } from 'react-native'

import { colorLomo, doradoLomo, hash } from '@logica/lomos'
import { fuentes } from '@tema'
import { cuero } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  libro: Pick<EjemplarDTO, 'id' | 'titulo' | 'autores' | 'tipo'>
  ancho: number
  alto: number
  colorFijo?: string | null
}

/*
 * PORTADA TIPOGRÁFICA (plan §9.5): cuando un libro no trae portada, nunca un
 * rectángulo vacío. Se encuaderna en cuero (el mismo color de su lomo), con
 * doble filete dorado, un florón y el título en Cormorant dorado, como un
 * libro antiguo de biblioteca.
 */
const PortadaGenerada: React.FC<Props> = ({ libro, ancho, alto, colorFijo }) => {
  const base = colorLomo(libro, colorFijo)
  const oro = doradoLomo(libro)
  const escala = ancho / 160
  const titulo = libro.titulo || 'Sin título'
  const tamTitulo = Math.max(14, Math.round((titulo.length > 40 ? 15 : titulo.length > 22 ? 18 : 22) * escala))
  const autor = libro.autores?.[0] ?? (libro.tipo === 'DOCUMENTO' ? 'Documento' : '')
  /* Tres encuadernaciones, estables por libro, para que la estantería no se repita:
     doble filete con florón, banda de cuero oscuro con estrella, y pespunte con hoja. */
  const estilo = hash(`${libro.id}|encuadernacion`) % 3
  const adorno = ['❦', '✦', '❧'][estilo]
  return (
    <View
      accessible={false}
      style={[
        styles.tapa,
        {
          width: ancho,
          height: alto,
          backgroundColor: base,
          borderTopRightRadius: 4 * escala,
          borderBottomRightRadius: 4 * escala,
        },
        web({
          backgroundImage: cuero(base),
          boxShadow: 'inset 6px 0 10px rgba(0,0,0,0.45), inset -1px 0 0 rgba(255,255,255,0.08)',
        }),
      ]}
    >
      <View style={[styles.marco, { borderColor: oro, margin: 8 * escala }, estilo === 2 && styles.pespunte]}>
        <View
          style={[styles.marcoInterior, { borderColor: oro, margin: 3 * escala }, estilo !== 0 && styles.sinFilete]}
        >
          <Text style={[styles.floron, { color: oro, fontSize: Math.max(14, 16 * escala) }]}>{adorno}</Text>
          <Text
            numberOfLines={5}
            style={[
              styles.titulo,
              { color: oro, fontSize: tamTitulo, lineHeight: tamTitulo * 1.1 },
              estilo === 1 && [styles.banda, { borderColor: oro }],
              web({ textShadow: '0 1px 0 rgba(0,0,0,0.6), 0 0 6px rgba(255,215,140,0.25)' }),
            ]}
          >
            {titulo}
          </Text>
          <View style={[styles.filete, { backgroundColor: oro, width: 36 * escala }]} />
          {autor ? (
            <Text
              numberOfLines={2}
              style={[styles.autor, { color: oro, fontSize: Math.max(14, Math.round(13 * escala)) }]}
            >
              {autor}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tapa: { overflow: 'hidden' },
  marco: { flex: 1, borderWidth: 1.5 },
  pespunte: { borderStyle: 'dashed', borderWidth: 1.2 },
  sinFilete: { borderWidth: 0 },
  banda: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  marcoInterior: {
    flex: 1,
    borderWidth: 0.7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  floron: { fontFamily: fuentes.titulo, opacity: 0.9 },
  titulo: { fontFamily: fuentes.tituloNegrita, textAlign: 'center', letterSpacing: 0.4 },
  filete: { height: 1, opacity: 0.8 },
  autor: { fontFamily: fuentes.tituloCursiva, textAlign: 'center' },
})

export default PortadaGenerada
