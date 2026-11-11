import React from 'react'

import { Pressable, StyleSheet, View } from 'react-native'

import Barra from '@componentes/atoms/Barra'
import Icono from '@componentes/atoms/Icono'
import Lomo from '@componentes/estanteria/Lomo'
import Portada from '@componentes/estanteria/Portada'
import { PropsLibroEnEstante, etiquetaLibro } from '@componentes/estanteria/tiposLibro'
import { useTheme } from '@contextos/ThemeContext'

/*
 * Versión NO web (la usan las pruebas, que corren como nativo). La de verdad,
 * con el gesto de sacar el libro, está en LibroEnEstante.web.tsx. Esta hace lo
 * esencial: tocar abre, mantener abre, y en modo ordenar los botones ‹ ›.
 */
const LibroEnEstante: React.FC<PropsLibroEnEstante> = (p) => {
  const { colors } = useTheme()
  const { libro, modo, onAbrir, ordenando, indice = 0, total = 1, onMover } = p
  return (
    <View style={styles.hueco}>
      <Pressable
        onPress={() => onAbrir(libro)}
        onLongPress={() => onAbrir(libro)}
        accessibilityRole="button"
        accessibilityLabel={etiquetaLibro(libro)}
        accessibilityHint="Abre la ficha del libro"
        testID={`libro-${libro.id}`}
        style={styles.tocable}
      >
        {modo === 'lomo' ? (
          <Lomo libro={libro} colorFijo={p.colorFijo} />
        ) : (
          <Portada libro={libro} ancho={p.anchoPortada ?? 104} />
        )}
      </Pressable>
      {p.conProgreso ? (
        <View style={{ width: p.anchoPortada ?? 104, marginTop: 6 }}>
          <Barra porcentaje={libro.porcentaje} etiqueta={`Progreso de ${libro.titulo}`} />
        </View>
      ) : null}
      {ordenando ? (
        <View style={styles.flechas}>
          <Pressable
            style={styles.flecha}
            disabled={indice === 0}
            onPress={() => onMover?.(indice, indice - 1)}
            accessibilityRole="button"
            accessibilityLabel={`Mover ${libro.titulo} a la izquierda`}
          >
            <Icono nombre="left" color={indice === 0 ? colors.textMuted : colors.text} />
          </Pressable>
          <Pressable
            style={styles.flecha}
            disabled={indice >= total - 1}
            onPress={() => onMover?.(indice, indice + 1)}
            accessibilityRole="button"
            accessibilityLabel={`Mover ${libro.titulo} a la derecha`}
          >
            <Icono nombre="right" color={indice >= total - 1 ? colors.textMuted : colors.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hueco: { alignItems: 'center', justifyContent: 'flex-end' },
  tocable: { minHeight: 44 },
  flechas: { flexDirection: 'row' },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})

export default LibroEnEstante
