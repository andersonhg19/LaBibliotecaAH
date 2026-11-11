import React from 'react'

import { ScrollView, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import LibroEnEstante from '@componentes/estanteria/LibroEnEstante'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { indiceDestino } from '@logica/orden'
import { fontSize, fuentes } from '@tema'
import { tablaEstante, vetaVertical } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  id: string
  titulo: string
  libros: EjemplarDTO[]
  modo: ModoEstante
  onAbrir: (l: EjemplarDTO) => void
  colorMadera?: string | null
  /** Si se puede ordenar a mano (Favoritos). */
  ordenable?: boolean
  ordenando?: boolean
  onAlternarOrden?: () => void
  onReordenar?: (desde: number, hasta: number) => void
  conProgreso?: boolean
  vacio?: string
  acciones?: React.ReactNode
}

/** Los centros (en x de pantalla) de los libros de un estante, tal como se ven ahora. */
const centrosDelEstante = (id: string): number[] => {
  if (typeof document === 'undefined') return []
  const nodos = Array.from(document.querySelectorAll<HTMLElement>(`[data-bah-estante="${CSS.escape(id)}"]`))
  return nodos
    .sort((a, b) => Number(a.dataset.bahIndice) - Number(b.dataset.bahIndice))
    .map((n) => {
      const r = n.getBoundingClientRect()
      return r.left + r.width / 2
    })
}

/*
 * UN ESTANTE DE LA BIBLIOTECA: placa de latón con el nombre, los libros de pie
 * sobre la tabla (alineados abajo, como de verdad), un sujetalibros al final y
 * la tabla de roble con su canto iluminado y la sombra que proyecta.
 */
const Estante: React.FC<Props> = ({
  id,
  titulo,
  libros,
  modo,
  onAbrir,
  colorMadera,
  ordenable,
  ordenando,
  onAlternarOrden,
  onReordenar,
  conProgreso,
  vacio,
  acciones,
}) => {
  const { colors, isDark } = useTheme()
  const soltarEn = (desde: number, x: number) => {
    const destino = indiceDestino(centrosDelEstante(id), x, desde)
    if (destino !== desde) onReordenar?.(desde, destino)
  }
  return (
    <View style={styles.mueble} testID={`estante-${id}`}>
      <View style={styles.cabecera}>
        <View
          style={[
            styles.placa,
            { borderColor: colors.primaryLight },
            web({
              backgroundImage: isDark
                ? 'linear-gradient(180deg, rgba(201,162,39,0.22), rgba(201,162,39,0.08))'
                : 'linear-gradient(180deg, rgba(139,90,43,0.16), rgba(139,90,43,0.06))',
              boxShadow: 'inset 0 1px 0 rgba(255,240,200,0.25), 0 2px 6px rgba(0,0,0,0.25)',
            }),
          ]}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${titulo}, ${libros.length} ${libros.length === 1 ? 'libro' : 'libros'}`}
        >
          <Text style={[styles.titulo, { color: isDark ? '#F0D9A0' : colors.primary }]} numberOfLines={1}>
            {titulo}
          </Text>
          <Text style={[styles.cuenta, { color: colors.textSecondary }]}>{libros.length}</Text>
        </View>
        <View style={styles.acciones}>
          {acciones}
          {ordenable && libros.length > 1 ? (
            <BotonIcono
              icono={ordenando ? 'check' : 'orden'}
              etiqueta={ordenando ? 'Terminar de ordenar' : `Ordenar ${titulo}`}
              onPress={() => onAlternarOrden?.()}
              activo={ordenando}
              testID={`ordenar-${id}`}
            />
          ) : null}
        </View>
      </View>
      {ordenando ? (
        <Text style={[styles.ayuda, { color: colors.textSecondary }]}>
          Arrastra un libro a su nuevo sitio, o usa las flechas ‹ ›. Toca ✓ al terminar.
        </Text>
      ) : null}

      <View
        style={[
          styles.fondoMueble,
          { backgroundColor: isDark ? '#1E110A' : '#7A4E28' },
          web({
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.35) 100%), ${vetaVertical}, linear-gradient(90deg, ${colorMadera ?? (isDark ? '#2B1A10' : '#8B5A2B')}, ${colorMadera ?? (isDark ? '#3A2416' : '#9A6935')})`,
            boxShadow:
              'inset 0 12px 18px rgba(0,0,0,0.5), inset 10px 0 14px rgba(0,0,0,0.35), inset -10px 0 14px rgba(0,0,0,0.35)',
          }),
        ]}
      >
        {libros.length === 0 ? (
          <View style={styles.vacio}>
            <Icono nombre="lomos" color="#D9C49A" tamano={28} />
            <Text style={styles.vacioTexto}>{vacio ?? 'Este estante está esperando su primer libro.'}</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.fila, modo === 'portada' && styles.filaPortadas]}
            scrollEnabled
          >
            {libros.map((l, i) => (
              <LibroEnEstante
                key={l.id}
                libro={l}
                modo={modo}
                onAbrir={onAbrir}
                colorFijo={null}
                ordenando={ordenando}
                estanteId={id}
                indice={i}
                total={libros.length}
                onMover={(d, h) => onReordenar?.(d, h)}
                onSoltarEn={soltarEn}
                conProgreso={conProgreso}
              />
            ))}
            {/* Sujetalibros de latón. */}
            <View
              accessible={false}
              style={[
                styles.sujetalibros,
                { backgroundColor: '#B8902C' },
                web({
                  backgroundImage: 'linear-gradient(90deg, #8C6A1C, #E6C76A 40%, #A47C22)',
                  boxShadow: '2px 0 6px rgba(0,0,0,0.5)',
                }),
              ]}
            />
          </ScrollView>
        )}
      </View>
      <View
        accessible={false}
        style={[
          styles.tabla,
          { backgroundColor: isDark ? '#5A3820' : '#9A6A38' },
          web({
            backgroundImage: tablaEstante(isDark),
            boxShadow: '0 10px 14px -4px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,220,170,0.35)',
          }),
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  mueble: { marginBottom: 26 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  placa: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexShrink: 1,
  },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, letterSpacing: 0.5 },
  cuenta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  acciones: { flexDirection: 'row', alignItems: 'center' },
  ayuda: { fontFamily: fuentes.ui, fontSize: fontSize.xs, paddingHorizontal: 16, marginBottom: 8 },
  fondoMueble: {
    marginHorizontal: 10,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 228,
    justifyContent: 'flex-end',
  },
  fila: { alignItems: 'flex-end', paddingHorizontal: 14, paddingTop: 22, gap: 2, minHeight: 228 },
  filaPortadas: { gap: 14, paddingTop: 18 },
  tabla: { height: 18, marginHorizontal: 4, borderRadius: 2 },
  sujetalibros: { width: 8, height: 110, marginLeft: 10, borderTopLeftRadius: 2, borderTopRightRadius: 8 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, minHeight: 200 },
  vacioTexto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md, color: '#E6D5B0', textAlign: 'center' },
})

export default Estante
